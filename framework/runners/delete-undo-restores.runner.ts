import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  DELETE_RECORDS_URL,
  getRecords as apiGetRecords,
  OPERATION_UNDO,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeleteUndoRestoresCaseConfig } from "../types";

// Delete every row in a table -> undo -> checkpoint: every row is back, with
// its id, its position and every cell exactly as before.
//
// This is a SENTINEL, not a reproduction. No bug behind it: it guards a path
// that has been rewritten repeatedly and whose failure mode is silent.
//
// Three changes in two weeks all removed something from the delete path in the
// name of speed - trash persistence folded into the delete transaction, the
// per-row trash markers replaced by a single index row, undo snapshots skipped
// for conversions that cannot change a value. Each is a reasonable
// optimisation, and each removes something undo might have been relying on.
// What makes that worth guarding rather than trusting is the shape of the
// failure: undo would still answer "fulfilled". It would just bring back less
// than it took - fewer rows, or rows with empty cells - and nothing in the
// response would say so.
//
// Being a sentinel, this case cannot be validated the way the rest of the
// repository is: there is no commit where it goes red, because the behaviour
// it guards has always been correct. That limit is real and is stated in the
// case doc. What it does buy is that the next change to this path has to keep
// undo whole, or a column turns red with the row and cell that went missing.
//
// The window id is the load-bearing detail. The undo stack is keyed by it, so
// the delete and the undo must carry the same one; a mismatched or missing id
// undoes nothing and the case would be asserting against an empty stack.

const TITLE_FIELD = "Title";
const NUMBER_FIELD = "Amount";
const CHECKBOX_FIELD = "Done";

type Row = { id: string; fields: Record<string, unknown> };

const describeRow = (row: Row | undefined) =>
  row ? JSON.stringify(row.fields) : "(missing)";

export const runDeleteUndoRestoresCase = async (
  bugCase: BugCaseFor<"delete-undo-restores">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeleteUndoRestoresCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  // Unique per run: the undo stack is shared state keyed by this, and a value
  // reused across runs could hand this case an entry it did not create.
  const windowId = `e2e-lab-undo-${context.runId}`;
  let tableId = "";

  if (config.recordCount < 2) {
    throw new Error(
      "recordCount below 2 - a single row cannot show a partial restore, which is the failure this guards",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText },
        { name: NUMBER_FIELD, type: FieldType.Number },
        { name: CHECKBOX_FIELD, type: FieldType.Checkbox },
      ],
      // Every row differs in every field, so a restore that brings rows back
      // with someone else's values - or with blanks - cannot pass unnoticed.
      records: Array.from({ length: config.recordCount }, (_, index) => ({
        fields: {
          [TITLE_FIELD]: `row-${index + 1}`,
          [NUMBER_FIELD]: index + 1,
          [CHECKBOX_FIELD]: index % 2 === 0,
        },
      })),
    });
    tableId = table.id;

    const readRows = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: config.recordCount + 10,
      });
      return {
        headers: response.headers,
        rows: response.data.records.map((record) => ({
          id: record.id,
          fields: record.fields as Record<string, unknown>,
        })) as Row[],
      };
    };

    // Fixture verification, outside the checkpoint: the rows are all there
    // before anything is deleted, and v2 answered the read the case compares
    // against.
    const before = await readRows();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (before.rows.length !== config.recordCount) {
      throw new Error(
        `seeded ${before.rows.length} rows, expected ${config.recordCount} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint("undo-restores-every-row", async () => {
      const recordIds = before.rows.map((row) => row.id);
      const deleteResponse = await axios.delete(
        urlBuilder(DELETE_RECORDS_URL, { tableId }),
        {
          params: { recordIds },
          headers: { "x-window-id": windowId },
          validateStatus: () => true,
        },
      );
      if (deleteResponse.status < 200 || deleteResponse.status >= 300) {
        throw new Error(
          `deleting the rows answered ${deleteResponse.status}: ${JSON.stringify(deleteResponse.data)}`,
        );
      }
      const deleteRouting = assertServedByV2(deleteResponse.headers, {
        operation: "DELETE /table/{tableId}/record",
        feature: "deleteRecord",
      });

      // The delete has to have actually emptied the table, or "everything came
      // back" would be trivially true.
      const emptied = await readRows();
      if (emptied.rows.length !== 0) {
        throw new Error(
          `the delete left ${emptied.rows.length} of ${config.recordCount} rows behind, so this case cannot tell whether undo restored anything`,
        );
      }

      const undoResponse = await axios.post(
        urlBuilder(OPERATION_UNDO, { tableId }),
        undefined,
        {
          headers: { "x-window-id": windowId },
          validateStatus: () => true,
        },
      );
      if (undoResponse.status < 200 || undoResponse.status >= 300) {
        throw new Error(
          `undo answered ${undoResponse.status}: ${JSON.stringify(undoResponse.data)}`,
        );
      }
      const undoStatus = (undoResponse.data as { status?: string })?.status;
      if (undoStatus !== "fulfilled") {
        throw new Error(
          `undo reported status ${JSON.stringify(undoStatus)}, expected "fulfilled": ${JSON.stringify(undoResponse.data)}`,
        );
      }

      const after = await readRows();
      if (after.rows.length !== config.recordCount) {
        throw new Error(
          `undo reported fulfilled but restored ${after.rows.length} of ${config.recordCount} rows`,
        );
      }

      // Same ids in the same order: a restore that reinserted the rows as new
      // records, or reordered them, is not the table the user had.
      const restoredIds = after.rows.map((row) => row.id);
      if (restoredIds.join() !== recordIds.join()) {
        throw new Error(
          `undo restored different rows or a different order: expected ${JSON.stringify(recordIds)}, got ${JSON.stringify(restoredIds)}`,
        );
      }

      // And every cell, because bringing a row back empty is the quiet half of
      // this failure - the row count would look right.
      for (const [index, original] of before.rows.entries()) {
        const restored = after.rows[index];
        if (
          JSON.stringify(restored?.fields) !== JSON.stringify(original.fields)
        ) {
          throw new Error(
            `undo restored row ${index + 1} (${original.id}) with different cells: had ${describeRow(original)}, got ${describeRow(restored)}`,
          );
        }
      }

      return {
        deleteRouting,
        undoStatus,
        undoEngine: String(
          (undoResponse.headers as Record<string, unknown>)?.[
            "x-teable-undo-redo-engine"
          ] ?? "",
        ),
        restored: after.rows.length,
      };
    });

    return {
      details: {
        tableId,
        windowId,
        routing,
        deleteRouting: probe.deleteRouting,
        undoStatus: probe.undoStatus,
        undoEngine: probe.undoEngine,
        restoredRows: probe.restored,
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
