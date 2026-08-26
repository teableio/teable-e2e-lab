import { FieldKeyType, FieldType } from "@teable/core";
import {
  deleteRecords as apiDeleteRecords,
  getRecords as apiGetRecords,
  getTrashItems as apiGetTrashItems,
  ResourceType,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeletedRowInTheTrashCaseConfig } from "../types";

// Delete a row -> checkpoint: it is in the table's trash.
//
// The trash is the promise that a delete is not final. It is what makes
// deleting a row an ordinary thing to do rather than a decision: someone
// clears out what looks like a duplicate, and if they were wrong it is there
// to be put back.
//
// The rows were not being written to it. The delete works and the row is gone,
// so there is nothing to notice until the day someone goes looking - and by
// then the row is not recoverable and nobody can say when it went. The trash
// being empty is not read as "this is broken", it is read as "I must have
// deleted it somewhere else".
//
// The case waits for the entry rather than reading once: what goes into the
// trash is written after the delete answers.

const NAME_FIELD = "Name";

export const runDeletedRowInTheTrashCase = async (
  bugCase: BugCaseFor<"deleted-row-in-the-trash">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeletedRowInTheTrashCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
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

    // Fixture verification, outside the checkpoint: this table's trash is
    // empty to begin with, so anything found afterwards came from the delete.
    const before = await apiGetTrashItems({
      resourceId: tableId,
      resourceType: ResourceType.Table,
    });
    if ((before.data.trashItems ?? []).length !== 0) {
      throw new Error(
        `the table's trash already holds ${before.data.trashItems.length} entries - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-deleted-row-is-in-the-trash",
      async () => {
        await apiDeleteRecords(tableId, [deletedRowId]);

        // The delete has to have happened, or "nothing is in the trash" would
        // be the correct answer and a different report.
        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 5,
        });
        const names = after.data.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
        );
        if (names.includes(config.deletedRowName)) {
          throw new Error(
            `the row is still in the table after being deleted: [${names.join(", ")}]`,
          );
        }

        // What goes into the trash is written after the delete answers.
        let entries: { resourceIds?: string[] }[] = [];
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          const trash = await apiGetTrashItems({
            resourceId: tableId,
            resourceType: ResourceType.Table,
          });
          entries = (trash.data.trashItems ?? []) as {
            resourceIds?: string[];
          }[];
          if (entries.length > 0) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }
        if (entries.length === 0) {
          throw new Error(
            `the row was deleted and the table's trash is empty after ${config.settleAttempts} tries - ` +
              "the row is not recoverable and nobody can say when it went",
          );
        }
        const holdsRow = entries.some((entry) =>
          (entry.resourceIds ?? []).includes(deletedRowId),
        );
        if (!holdsRow) {
          throw new Error(
            `the trash holds ${entries.length} entries and none of them is the deleted row: ${JSON.stringify(entries)}`,
          );
        }
        return { entries: entries.length };
      },
    );

    return {
      details: {
        tableId,
        deletedRowId,
        trashEntries: probe.entries,
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
