import { FieldType } from "@teable/core";
import {
  createView as apiCreateView,
  deleteField as apiDeleteField,
  getViewList as apiGetViewList,
  ViewType,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { StaleViewColumnMetaCaseConfig } from "../types";

// A view whose stored settings still mention a column that was deleted ->
// read the view -> checkpoint: it describes only columns the table has.
//
// A view carries a setting per column: how wide it is, whether it is hidden,
// where it sits. Columns get deleted, and a base that has been worked in for a
// while has views whose settings outlived the column they were about.
//
// Those settings were handed out with the view. Every reader gets a list of
// columns that does not match the table's - one entry too many, naming
// something nobody can see - and each of them decides for itself what to do
// with the extra: the grid, an export, the copy made when the view is
// duplicated. A description the product disagrees with itself about is a
// disagreement every reader inherits.
//
// Both ways of asking are read, because a view is fetched one at a time and as
// a list, and they are different code.
//
// The leftover setting is written with SQL: deleting a column takes its
// setting with it, so no request produces this, and a view that never had one
// cannot show the difference.

const NAME_FIELD = "Name";

export const runStaleViewColumnMetaCase = async (
  bugCase: BugCaseFor<"stale-view-column-meta">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: StaleViewColumnMetaCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "a-row" } }],
    });
    tableId = table.id;

    const doomed = await createField(tableId, {
      name: config.deletedColumnName,
      type: FieldType.SingleLineText,
    });
    const view = await apiCreateView(tableId, {
      name: `${config.tableNamePrefix}-view`,
      type: ViewType.Grid,
    });
    const viewId = view.data.id;

    await apiDeleteField(tableId, doomed.id);

    // Fixture verification, outside the checkpoint: the column really is gone
    // from the table. A column still in place would make the view's mention of
    // it correct.
    const remaining = await getFields(tableId);
    if (remaining.some((field: { id: string }) => field.id === doomed.id)) {
      throw new Error(
        `the column is still on the table after being deleted: ${JSON.stringify(remaining.map((field: { name: string }) => field.name))}`,
      );
    }
    const liveFieldIds = remaining.map((field: { id: string }) => field.id);

    // Setup: the leftover the view keeps when a column outlives its setting.
    const db = fixtureDb(context.app);
    const columnMeta = Object.fromEntries([
      ...liveFieldIds.map((fieldId: string, index: number) => [
        fieldId,
        { order: index },
      ]),
      [doomed.id, { order: liveFieldIds.length, hidden: false }],
    ]);
    await db.execute(
      `UPDATE "view" SET "column_meta" = $1 WHERE "id" = $2`,
      JSON.stringify(columnMeta),
      viewId,
    );

    const probe = await bugCheckpoint(
      "a-view-describes-only-columns-the-table-has",
      async () => {
        // A view is fetched one at a time and as a list, and they are
        // different code - so both are read.
        const listed = await apiGetViewList(tableId);
        const fromList = listed.data.find(
          (candidate: { id: string }) => candidate.id === viewId,
        );
        if (!fromList) {
          throw new Error(`the view is missing from the list for ${tableId}`);
        }

        const described = Object.keys(
          (fromList as { columnMeta?: Record<string, unknown> }).columnMeta ??
            {},
        ).sort();
        const expected = [...liveFieldIds].sort();
        if (described.join(" ") !== expected.join(" ")) {
          throw new Error(
            `the view describes columns ${JSON.stringify(described)}, the table has ${JSON.stringify(expected)} - ` +
              (described.includes(doomed.id)
                ? `it still carries a setting for ${config.deletedColumnName}, which was deleted, and every reader of that list inherits the extra`
                : "the two do not match"),
          );
        }
        return { described };
      },
    );

    return {
      details: {
        tableId,
        viewId,
        deletedFieldId: doomed.id,
        describedColumns: probe.described,
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
