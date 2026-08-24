import { FieldType } from "@teable/core";
import {
  axios,
  getTableList as apiGetTableList,
  DELETE_TABLE,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeleteErrorStateTableCaseConfig } from "../types";

// A table whose creation failed half way -> delete it -> checkpoint: it goes.
//
// Creating a table is several steps, and when one of them fails the table is
// left marked as broken. That marking is what the product uses to keep the
// half-made thing out of the way of everything that expects a working table.
//
// Delete went through the same door. It looked for a working table, did not
// find one, and refused - so the broken table stays in the sidebar, cannot be
// opened and cannot be removed. The only thing a user can do about it is ask
// someone with database access.
//
// The marking is written with SQL: making a table creation fail on purpose is
// not something the product offers, and reproducing the failure would be
// testing the failure rather than the cleanup.

const NAME_FIELD = "Name";

export const runDeleteErrorStateTableCase = async (
  bugCase: BugCaseFor<"delete-error-state-table">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeleteErrorStateTableCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let deleted = false;

  try {
    // A second table alongside it: the delete has to take the broken one and
    // nothing else.
    const neighbour = await createTable(baseId, {
      name: `${suffix}-neighbour`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });

    const broken = await createTable(baseId, {
      name: `${suffix}-broken`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableId = broken.id;

    // Setup, outside the checkpoint: mark the table the way the product marks
    // one whose creation failed part way through.
    const db = fixtureDb(context.app);
    await db.execute(
      `UPDATE "table_meta" SET "provision_state" = 'error' WHERE "id" = $1`,
      tableId,
    );

    const probe = await bugCheckpoint(
      "a-table-whose-creation-failed-can-be-deleted",
      async () => {
        // Raw axios with the status open: the refusal is the report, and the
        // generated client throws the body away with it.
        const response = await axios.delete(
          urlBuilder(DELETE_TABLE, { baseId, tableId }),
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `deleting the half-made table answered ${response.status}: ${JSON.stringify(response.data)} - it ` +
              "stays in the sidebar, cannot be opened and cannot be removed",
          );
        }
        deleted = true;

        const listed = await apiGetTableList(baseId);
        const ids = listed.data.map((table: { id: string }) => table.id);
        if (ids.includes(tableId)) {
          throw new Error(
            `the delete answered ${response.status} but the table is still listed in the base`,
          );
        }
        if (!ids.includes(neighbour.id)) {
          throw new Error(
            `deleting the half-made table also removed ${neighbour.id}, which was working`,
          );
        }
        return { status: response.status };
      },
    );

    return {
      details: {
        tableId,
        neighbourTableId: neighbour.id,
        deleteStatus: probe.status,
      },
    };
  } finally {
    if (tableId && !deleted) {
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
