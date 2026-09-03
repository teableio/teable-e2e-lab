import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  CREATE_RECORD,
  OPERATION_UNDO,
  UPDATE_RECORD,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UndoCursorAfterAFailedUndoCaseConfig } from "../types";

// An undo that cannot be carried out -> press undo again -> checkpoint: the
// second press tries the same step again, and does not reach past it.
//
// Undo walks backwards through what you did. The place it has walked back to
// was moved BEFORE the step was carried out, and never moved back when the step
// failed - so a failed undo still counted as done. The next press therefore
// skipped over it and undid the step before, which is one the person had not
// asked to reverse.
//
// A step can fail to reverse for ordinary reasons. Here it is a column that does
// not allow duplicates: a value was changed away from something, somebody else's
// row has taken that value since, and putting the old one back would now
// collide. Nothing is wrong with the data or the request.
//
// What makes this bad is not the failed undo - that is honest, and the person
// can see it. It is the second press, which quietly reverses something else. In
// this fixture the step before is the row's creation, so pressing undo twice
// deletes a row nobody asked to delete.
//
// Concurrency is out of scope. The report also lists two requests undoing at
// once, two appends racing, and a crash between writes; a single client against
// one process cannot show any of those, and this case does not claim to.

const NAME_FIELD = "Name";
const CODE_FIELD = "Code";

export const runUndoCursorAfterAFailedUndoCase = async (
  bugCase: BugCaseFor<"undo-cursor-after-a-failed-undo">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UndoCursorAfterAFailedUndoCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  // The stack is keyed by this, so everything meant to be on it must carry the
  // same one - and the row that creates the collision must NOT, or it lands on
  // the stack too and the case is undoing a different history.
  const windowId = `e2e-lab-undo-cursor-${context.runId}`;
  const otherWindowId = `${windowId}-someone-else`;
  let tableId = "";

  if (config.originalCode === config.changedCode) {
    throw new Error(
      "the value has to actually change, or there is nothing for undo to put back",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableId = table.id;
    const nameFieldId = table.fields[0].id;

    // A column that does not allow duplicates. This is what makes putting the
    // old value back impossible later.
    const codeField = await createField(table.id, {
      name: CODE_FIELD,
      type: FieldType.SingleLineText,
      unique: true,
    });

    const readRows = async () => {
      const response = await apiGetRecords(table.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 20,
      });
      return {
        headers: response.headers,
        rows: response.data.records.map((record) => ({
          id: record.id,
          name: String(record.fields[nameFieldId] ?? ""),
          code: record.fields[codeField.id] ?? null,
        })),
      };
    };

    // Every write goes through raw axios so it can carry the window id. The
    // generated client takes no per-call headers, and a write without the id
    // simply does not reach the stack - which reads as an empty stack later,
    // not as an error.
    const writeAs = async (onWindow: string, name: string, code: string) => {
      const response = await axios.post(
        urlBuilder(CREATE_RECORD, { tableId: table.id }),
        {
          fieldKeyType: FieldKeyType.Id,
          typecast: false,
          records: [{ fields: { [nameFieldId]: name, [codeField.id]: code } }],
        },
        {
          headers: { "x-window-id": onWindow },
          validateStatus: () => true,
        },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `writing ${JSON.stringify(name)} answered ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }
      return (response.data as { records?: { id?: string }[] })?.records?.[0]
        ?.id;
    };

    // The step before: the row is created. This is what a second press reaches
    // if the first one is wrongly counted as done.
    const rowId = await writeAs(windowId, config.rowName, config.originalCode);
    if (!rowId) {
      throw new Error("the row was not created");
    }

    // The step under test: its value is changed away from the original.
    const changed = await axios.patch(
      urlBuilder(UPDATE_RECORD, { tableId: table.id, recordId: rowId }),
      {
        fieldKeyType: FieldKeyType.Id,
        record: { fields: { [codeField.id]: config.changedCode } },
      },
      { headers: { "x-window-id": windowId }, validateStatus: () => true },
    );
    if (changed.status < 200 || changed.status >= 300) {
      throw new Error(
        `changing the value answered ${changed.status}: ${JSON.stringify(changed.data)}`,
      );
    }

    // Somebody else takes the value that was let go. On another window, so it
    // is not on the stack this case walks back through.
    await writeAs(otherWindowId, config.otherRowName, config.originalCode);

    const seeded = await readRows();
    if (seeded.rows.length !== 2) {
      throw new Error(
        `the table holds ${seeded.rows.length} rows, expected 2 - the fixture is not in place`,
      );
    }
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const pressUndo = async () =>
      axios.post(urlBuilder(OPERATION_UNDO, { tableId: table.id }), undefined, {
        headers: { "x-window-id": windowId },
        validateStatus: () => true,
      });

    // Fixture verification, outside the checkpoint: the first press really
    // cannot be carried out. If it succeeded, there would be no failed step for
    // the second press to skip and the case would be reporting on nothing.
    const first = await pressUndo();
    const firstStatus = (first.data as { status?: string })?.status;
    if (
      first.status >= 200 &&
      first.status < 300 &&
      firstStatus === "fulfilled"
    ) {
      throw new Error(
        `undo put the old value back even though another row holds it - the fixture is not in place: ` +
          JSON.stringify(first.data),
      );
    }
    const afterFirst = await readRows();
    if (afterFirst.rows.length !== 2) {
      throw new Error(
        `the failed undo left ${afterFirst.rows.length} rows, expected both still there: ` +
          JSON.stringify(afterFirst.rows),
      );
    }

    const probe = await bugCheckpoint(
      "a-second-undo-after-a-failed-one-does-not-reach-past-it",
      async () => {
        const second = await pressUndo();
        const rows = (await readRows()).rows;
        const scene = {
          firstUndo: { status: first.status, body: first.data },
          secondUndo: { status: second.status, body: second.data },
          rows,
        };

        const row = rows.find((candidate) => candidate.id === rowId);
        if (!row) {
          throw new Error(
            `pressing undo twice deleted ${JSON.stringify(config.rowName)}, which nobody asked to delete: ` +
              `the second press reached past the step that could not be carried out and reversed the row's creation. ` +
              JSON.stringify(scene),
          );
        }
        if (String(row.code) !== config.changedCode) {
          throw new Error(
            `${JSON.stringify(config.rowName)} reads ${JSON.stringify(row.code)}, expected ` +
              `${JSON.stringify(config.changedCode)} - the step that could not be carried out is still not carried out. ` +
              JSON.stringify(scene),
          );
        }
        return {
          rows,
          firstUndo: scene.firstUndo,
          secondUndo: scene.secondUndo,
        };
      },
    );

    return {
      details: {
        tableId: table.id,
        rowId,
        windowId,
        routing,
        ...probe,
      },
    };
  } finally {
    if (tableId) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
