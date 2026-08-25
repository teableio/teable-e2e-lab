import { FieldKeyType, FieldType } from "@teable/core";
import {
  deleteRecords as apiDeleteRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeleteWithoutUndoCaptureCaseConfig } from "../types";

// A table whose undo bookkeeping is not in place -> delete a row -> checkpoint:
// the row is deleted.
//
// Deleting a row also records what was in it, so the delete can be undone. The
// recording is bookkeeping: it belongs to the product's convenience, not to
// the person's decision to delete the row.
//
// When the recording could not be made, the delete was undone as well - the
// row came back. The person selects a row, deletes it, and it is still there;
// they try again and it is still there. Nothing on screen mentions undo, so
// there is nothing to connect the refusal to, and no way to get rid of the
// row.
//
// Whether the recording is in place is not something a person can see or
// control, which is why "the recording failed" is not an answer they can act
// on. Losing the ability to undo is a smaller loss than losing the ability to
// delete.
//
// The bookkeeping is turned off with SQL: no request produces a table without
// it, and a table that has always had it cannot show the difference.

const NAME_FIELD = "Name";
const UNDO_TRIGGER = "__teable_undo_capture";

export const runDeleteWithoutUndoCaptureCase = async (
  bugCase: BugCaseFor<"delete-without-undo-capture">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeleteWithoutUndoCaptureCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      // A second row that is never deleted: a delete that took the whole table
      // with it and a delete that took the right row are otherwise the same
      // answer.
      records: [
        { fields: { [NAME_FIELD]: config.deletedRowName } },
        { fields: { [NAME_FIELD]: config.keptRowName } },
      ],
    });
    tableId = table.id;
    const deletedRowId = table.records?.[0]?.id;
    if (!deletedRowId || !table.records?.[1]?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(tableId);

    // Fixture verification, outside the checkpoint: the bookkeeping is there
    // to begin with. If the trigger were named something else, or absent on
    // every table, turning it off would be a no-op and the case would be
    // watching an ordinary delete.
    const triggers = await db.query<{ tgname: string }[]>(
      `SELECT t.tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2 AND NOT t.tgisinternal`,
      physical.schema,
      physical.table,
    );
    if (!triggers.some((trigger) => trigger.tgname === UNDO_TRIGGER)) {
      throw new Error(
        `the table has no ${UNDO_TRIGGER} to turn off - it carries ${JSON.stringify(
          triggers.map((trigger) => trigger.tgname),
        )}, so this case would be watching an ordinary delete`,
      );
    }

    await db.execute(
      `ALTER TABLE "${physical.schema}"."${physical.table}" DISABLE TRIGGER "${UNDO_TRIGGER}"`,
    );

    const probe = await bugCheckpoint(
      "a-row-is-deleted-when-its-undo-bookkeeping-is-not-in-place",
      async () => {
        // A refused delete throws here, and so does a delete that answers and
        // leaves the row - the read below is what tells those apart.
        await apiDeleteRecords(tableId, [deletedRowId]);

        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 10,
        });
        const names = after.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
          )
          .sort();
        if (names.includes(config.deletedRowName)) {
          throw new Error(
            `the deleted row is still there: the table holds [${names.join(", ")}] - ` +
              "the delete was undone because the product could not record how to undo it",
          );
        }
        if (names.join(" ") !== config.keptRowName) {
          throw new Error(
            `the table holds [${names.join(", ")}], expected only ${config.keptRowName}`,
          );
        }
        return { names };
      },
    );

    return {
      details: {
        tableId,
        deletedRowId,
        physicalTable: `${physical.schema}.${physical.table}`,
        rowsAfterDelete: probe.names,
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
