import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
} from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  PASTE_URL,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { PasteNoopStampCaseConfig } from "../types";

// Paste a column of values over rows that already hold exactly those values ->
// checkpoint: none of those rows is marked as changed.
//
// Pasting over a selection is not always an edit. People re-paste the same
// export to be sure it went in, paste a column back over itself after sorting,
// or paste a block that overlaps rows they already filled in. The rows that
// end up holding what they already held were not changed by that.
//
// They were stamped anyway. "Last changed" is what a team uses to see what
// moved since yesterday, and a paste that rewrites the stamp on rows it did
// not touch erases exactly that: every row looks touched, the column stops
// meaning anything, and there is no way to get the old stamps back.
//
// The control is a real edit made the same way, first and outside the
// checkpoint: it proves the stamp does move here, so a stamp that stayed put
// afterwards is the paste being recognised as a no-op rather than a column
// that never updates.

const NAME_FIELD = "Name";
const NOTE_FIELD = "Note";
const CHANGED_FIELD = "Last changed";

export const runPasteNoopStampCase = async (
  bugCase: BugCaseFor<"paste-noop-stamp">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PasteNoopStampCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "control-row",
            [NOTE_FIELD]: config.controlNote,
          },
        },
        {
          fields: {
            [NAME_FIELD]: "untouched-row",
            [NOTE_FIELD]: config.keptNote,
          },
        },
      ],
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const controlRowId = table.records?.[0]?.id;
    const untouchedRowId = table.records?.[1]?.id;
    if (!viewId || !controlRowId || !untouchedRowId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const changed = await createField(tableId, {
      name: CHANGED_FIELD,
      type: FieldType.LastModifiedTime,
      options: {
        formatting: {
          date: DateFormattingPreset.ISO,
          time: TimeFormatting.Hour24,
          timeZone: "UTC",
        },
      },
    });
    const noteFieldIndex = 1;

    const stamps = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        viewId,
        take: 5,
      });
      return new Map<string, string>(
        read.data.records.map(
          (record: { id: string; fields: Record<string, unknown> }) => [
            record.id,
            String(record.fields[changed.id] ?? ""),
          ],
        ),
      );
    };

    const paste = async (rowIndex: number, value: string) =>
      axios.patch(
        urlBuilder(PASTE_URL, { tableId }),
        {
          viewId,
          ranges: [
            [noteFieldIndex, rowIndex],
            [noteFieldIndex, rowIndex],
          ],
          content: value,
        },
        { validateStatus: () => true },
      );

    // Control, outside the checkpoint: a paste that really changes a cell
    // moves the stamp. Without it, a stamp that stayed put afterwards could
    // just as well be a column that never updates.
    const beforeControl = await stamps();
    await new Promise((resolve) => setTimeout(resolve, config.stepMs));
    const controlResponse = await paste(0, config.editedNote);
    if (controlResponse.status < 200 || controlResponse.status >= 300) {
      throw new Error(
        `the control paste answered ${controlResponse.status}: ${JSON.stringify(controlResponse.data)}`,
      );
    }
    const afterControl = await stamps();
    if (
      afterControl.get(controlRowId) === beforeControl.get(controlRowId) ||
      !afterControl.get(controlRowId)
    ) {
      throw new Error(
        `a paste that changed a cell left the stamp at ${JSON.stringify(afterControl.get(controlRowId))} - ` +
          "the last-changed column does not move here, so this case cannot tell a no-op from a column that never updates",
      );
    }

    await new Promise((resolve) => setTimeout(resolve, config.stepMs));
    const before = await stamps();

    const probe = await bugCheckpoint(
      "pasting-what-a-row-already-holds-does-not-mark-it-changed",
      async () => {
        // The same value the row already holds, pasted over it.
        const response = await paste(1, config.keptNote);
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `pasting a row's own value back answered ${response.status}: ${JSON.stringify(response.data)}`,
          );
        }

        const after = await stamps();
        if (after.get(untouchedRowId) !== before.get(untouchedRowId)) {
          throw new Error(
            `the row was marked as changed at ${JSON.stringify(after.get(untouchedRowId))}, it read ` +
              `${JSON.stringify(before.get(untouchedRowId))} before - the paste put back what was already there`,
          );
        }
        // And the row still holds what it held: a paste that wrote nothing at
        // all would keep the stamp too, and that is a different report.
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId,
          take: 5,
        });
        const note = read.data.records.find(
          (record: { id: string }) => record.id === untouchedRowId,
        )?.fields[NOTE_FIELD];
        if (note !== config.keptNote) {
          throw new Error(
            `the row holds ${JSON.stringify(note)}, expected ${JSON.stringify(config.keptNote)}`,
          );
        }
        return { stamp: after.get(untouchedRowId) };
      },
    );

    return {
      details: {
        tableId,
        controlRowId,
        untouchedRowId,
        stampAfterNoopPaste: probe.stamp,
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
