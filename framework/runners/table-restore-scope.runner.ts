import { FieldType } from "@teable/core";
import {
  axios,
  getTrashItems as apiGetTrashItems,
  restoreTrash as apiRestoreTrash,
  DELETE_TABLE,
  ResourceType,
  urlBuilder,
} from "@teable/openapi";
import {
  createTable,
  deleteField,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TableRestoreScopeCaseConfig } from "../types";

// A column deleted long ago, a table trashed today, and that table restored ->
// checkpoint: the column stays deleted.
//
// Restoring a table has to put back what the table's own delete took away, and
// nothing else. Deleting a table marks its fields and views deleted alongside
// it, so the restore looks for the things marked deleted - and it took every
// one of them, including the column somebody removed months earlier for a
// reason they had at the time.
//
// What comes back is a table with a column nobody expected, holding whatever
// was in it when it was removed. On a table that has been tidied more than
// once, the restore is an undo of the tidying too.
//
// The old deletion is backdated with SQL. Deleting the column a moment before
// trashing the table would leave the two indistinguishable by time, which is
// the one thing the restore has to tell apart - and a case that cannot tell
// them apart either would pass on a build that restores everything.

const NAME_FIELD = "Name";
const KEPT_FIELD = "Kept";
const RETIRED_FIELD = "Retired";

export const runTableRestoreScopeCase = async (
  bugCase: BugCaseFor<"table-restore-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TableRestoreScopeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.backdateHours < 1) {
    throw new Error(
      "the old deletion has to be backdated by at least an hour - deleted in the same moment as the table, " +
        "the two are indistinguishable by time and the case would pass on a build that restores everything",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: KEPT_FIELD, type: FieldType.SingleLineText },
        { name: RETIRED_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "the-row",
            [KEPT_FIELD]: "kept",
            [RETIRED_FIELD]: "retired",
          },
        },
      ],
    });
    tableId = table.id;
    const retiredFieldId = table.fields.find(
      (field: { name: string }) => field.name === RETIRED_FIELD,
    )?.id;
    if (!retiredFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Retired long before today, the way a column that was tidied away is.
    await deleteField(tableId, retiredFieldId);
    const db = fixtureDb(context.app);
    const backdated = await db.execute(
      `UPDATE "field" SET "deleted_time" = NOW() - ($1 || ' hours')::interval WHERE "id" = $2`,
      String(config.backdateHours),
      retiredFieldId,
    );
    if (backdated !== 1) {
      throw new Error(
        `backdating the retired column touched ${backdated} rows, expected 1`,
      );
    }

    // Fixture verification, outside the checkpoint: the column really is gone
    // before the table is trashed.
    const beforeTrash = await getFields(tableId);
    if (
      beforeTrash.some(
        (field: { name: string }) => field.name === RETIRED_FIELD,
      )
    ) {
      throw new Error(
        `"${RETIRED_FIELD}" is still on the table before it was trashed - the fixture is not in place`,
      );
    }

    await axios.delete(urlBuilder(DELETE_TABLE, { baseId, tableId }));

    let trashId = "";
    const deadline = Date.now() + config.trashVisibleTimeoutMs;
    for (;;) {
      const items = await apiGetTrashItems({
        resourceType: ResourceType.Base,
        resourceId: baseId,
      });
      trashId =
        (items.data.trashItems ?? []).find(
          (item: { resourceId?: string }) => item.resourceId === tableId,
        )?.id ?? "";
      if (trashId) {
        break;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `the trashed table did not reach the trash within ${config.trashVisibleTimeoutMs}ms - there is ` +
            "nothing here to restore",
        );
      }
      await new Promise<void>((resolveSleep) => {
        setTimeout(resolveSleep, config.pollIntervalMs);
      });
    }

    const probe = await bugCheckpoint(
      "restoring-a-table-brings-back-only-its-own-delete",
      async () => {
        await apiRestoreTrash(trashId);

        const fields = await getFields(tableId);
        const names = fields.map((field: { name: string }) => field.name);
        if (!names.includes(KEPT_FIELD)) {
          throw new Error(
            `the restored table is missing "${KEPT_FIELD}": it has ${JSON.stringify(names)}`,
          );
        }
        if (names.includes(RETIRED_FIELD)) {
          throw new Error(
            `the restored table brought "${RETIRED_FIELD}" back - it was deleted ${config.backdateHours} ` +
              "hours before the table was trashed, and restoring the table is not an undo of that",
          );
        }
        return { names };
      },
    );

    return {
      details: {
        tableId,
        retiredFieldId,
        backdateHours: config.backdateHours,
        fieldsAfterRestore: probe.names,
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
