import { Colors, FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  updateRecordOrders as apiUpdateRecordOrders,
  PASTE_URL,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TiedSortOffsetCaseConfig } from "../types";

// A view sorted by a column where several rows share the same value, with one
// row dragged out of its place -> paste into the second row on screen ->
// checkpoint: the row that changes is the one that was second on screen.
//
// A sort only decides the order of rows whose values differ. Rows that tie
// keep whatever order the view already had, which is what dragging a row does.
// That is an ordinary personal view: sorted by status or by owner, where most
// rows share a value, with a couple pulled to the top by hand.
//
// Operations addressed by position - paste, clear, delete a range - resolved
// the tie differently from the grid, so they landed on a different row than
// the one the user had selected. Nothing about that looks like an error: a
// value appears in the column, on the wrong row, and the row that was supposed
// to change is untouched.
//
// The case asserts by name, not by position, because the whole failure is that
// the two disagree.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";

export const runTiedSortOffsetCase = async (
  bugCase: BugCaseFor<"tied-sort-offset">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TiedSortOffsetCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.rowTitles.length < 3) {
    throw new Error(
      "at least three rows - with two, a drag and a reversal look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [{ name: config.sharedStatus, color: Colors.Blue }],
          },
        },
      ],
      // Every row shares the status, so the sort decides nothing and the
      // view's own row order decides everything.
      records: config.rowTitles.map((title) => ({
        fields: { [NAME_FIELD]: title, [STATUS_FIELD]: config.sharedStatus },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const statusFieldId = table.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    )?.id;
    const nameFieldIndex = table.fields.findIndex(
      (field: { name: string }) => field.name === NAME_FIELD,
    );
    if (!viewId || !statusFieldId || nameFieldIndex < 0) {
      throw new Error(`Table ${tableId} is not in place`);
    }
    const recordIdByName = new Map<string, string>(
      table.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD] ?? ""),
          record.id,
        ],
      ),
    );
    const draggedId = recordIdByName.get(config.draggedRowTitle);
    const anchorId = recordIdByName.get(config.rowTitles[0] as string);
    if (!draggedId || !anchorId) {
      throw new Error("the fixture rows are not in place");
    }

    // Drag the last row to the top, the way someone pulls a row they care
    // about out of a list where everything ties.
    await apiUpdateRecordOrders(tableId, viewId, {
      anchorId,
      position: "before",
      recordIds: [draggedId],
    });

    // Sort the view by the tied column. Rows that tie keep the order above.
    await axios.put(
      `/table/${tableId}/view/${viewId}/sort`,
      { sort: { sortObjs: [{ fieldId: statusFieldId, order: "asc" }] } },
      { validateStatus: () => true },
    );

    const visibleOrder = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        viewId,
        take: config.rowTitles.length,
      });
      return read.data.records.map(
        (record: { fields: Record<string, unknown> }) =>
          String(record.fields[NAME_FIELD] ?? ""),
      );
    };

    // Fixture verification, outside the checkpoint: the dragged row really is
    // at the top, so the order the grid shows is not the order the rows were
    // created in. Without that the two ways of resolving the tie would agree
    // and the case would prove nothing.
    const before = await visibleOrder();
    if (before[0] !== config.draggedRowTitle) {
      throw new Error(
        `the view shows ${JSON.stringify(before)}; expected ${config.draggedRowTitle} first - the fixture is ` +
          "not in place",
      );
    }
    const targetName = before[1];
    if (!targetName) {
      throw new Error("the view has no second row");
    }

    const probe = await bugCheckpoint(
      "an-offset-lands-on-the-row-shown-at-that-offset",
      async () => {
        // Paste into the second row on screen, first column.
        const response = await axios.patch(
          urlBuilder(PASTE_URL, { tableId }),
          {
            viewId,
            ranges: [
              [nameFieldIndex, 1],
              [nameFieldIndex, 1],
            ],
            content: config.pastedValue,
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `pasting into the second row answered ${response.status}: ${JSON.stringify(response.data)}`,
          );
        }

        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId,
          take: config.rowTitles.length,
        });
        const changed = after.data.records
          .filter(
            (record: { fields: Record<string, unknown> }) =>
              record.fields[NAME_FIELD] === config.pastedValue,
          )
          .map((record: { id: string }) => record.id);
        const targetId = recordIdByName.get(targetName);
        if (changed.length !== 1) {
          throw new Error(
            `pasting one cell changed ${changed.length} rows: ${JSON.stringify(changed)}`,
          );
        }
        if (changed[0] !== targetId) {
          const wrongName = [...recordIdByName.entries()].find(
            ([, id]) => id === changed[0],
          )?.[0];
          throw new Error(
            `the paste went into ${JSON.stringify(wrongName)}, not ${JSON.stringify(targetName)}, which is ` +
              "the row shown at that position - the value lands on a row nobody selected and the selected " +
              "row is untouched",
          );
        }
        return { targetName, changedId: changed[0] };
      },
    );

    return {
      details: {
        tableId,
        visibleOrderBefore: before,
        pastedInto: probe.targetName,
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
