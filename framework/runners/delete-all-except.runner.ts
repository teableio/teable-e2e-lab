import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  getRowCount as apiGetRowCount,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { chunk } from "../chunk";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeleteAllExceptCaseConfig } from "../types";

// Select everything, unselect a couple of rows, delete -> checkpoint: what is
// left is exactly what was unselected.
//
// "Everything except these" is how a table is cleared out in practice: select
// all, click off the few worth keeping, delete. The request says so literally -
// all rows, minus this list.
//
// The rows are deleted in batches, and the batches walk the table by position.
// The rows being kept were passed over without the position being moved past
// them, so each batch started where the previous one did and the walk stopped
// early: some rows were deleted, some were silently left, and which ones
// depends on where the kept rows fell.
//
// Nothing reports a failure. The count of what was deleted is reported, and it
// is lower than the number of rows that were selected - but the person who has
// just cleared a table is looking at the table, not at a count, and what they
// see is a few rows still there.

const NAME_FIELD = "Name";
const DELETE_BY_ID_URL = "/table/{tableId}/selection/delete-by-id";

export const runDeleteAllExceptCase = async (
  bugCase: BugCaseFor<"delete-all-except">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeleteAllExceptCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.keepPositions.length === 0) {
    throw new Error(
      "at least one row has to be kept - with nothing excluded this is an ordinary delete-everything, which was " +
        "never the broken shape",
    );
  }
  if (config.keepPositions.some((position) => position >= config.rowCount)) {
    throw new Error(
      `the rows to keep ${JSON.stringify(config.keepPositions)} do not all exist in a table of ${config.rowCount}`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: Array.from({ length: config.rowCount }, (_, index) => ({
        fields: { [NAME_FIELD]: `row-${index}` },
      })),
    });
    tableId = table.id;
    const rows = table.records as {
      id: string;
      fields: Record<string, unknown>;
    }[];
    if (rows.length !== config.rowCount) {
      throw new Error(
        `${rows.length} of ${config.rowCount} rows landed - the fixture is not in place`,
      );
    }
    const kept = config.keepPositions.map((position) => rows[position]!);
    const keptNames = kept.map((row) => String(row.fields[NAME_FIELD] ?? ""));

    // What is left after the delete is small, so it is read in full; before the
    // delete only the count is asked for, because reading thousands of rows to
    // confirm they exist is not what this case is about.
    const readWhatIsLeft = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.keepPositions.length + 20,
      });
      return {
        headers: response.headers,
        names: response.data.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD] ?? ""),
        ),
      };
    };

    // Fixture verification, outside the checkpoint: every row is there before
    // anything is deleted.
    const counted = await apiGetRowCount(tableId, {});
    // Which engine answers the count is recorded rather than asserted: it was
    // not on v2 when this fix landed, so requiring it turns the pre-fix column
    // from "the rows were left behind" into "the lab could not run" (run
    // 34576375172).
    const routing = pickRoutingHeaders(counted.headers);
    if (counted.data.rowCount !== config.rowCount) {
      throw new Error(
        `the table holds ${counted.data.rowCount} rows, expected ${config.rowCount}`,
      );
    }

    const probe = await bugCheckpoint(
      "everything-except-these-leaves-exactly-these",
      async () => {
        // What the click sends: no explicit list of rows, so the rows are
        // whatever the current view holds, minus the ones clicked off.
        const deleted = await axios.post(
          urlBuilder(DELETE_BY_ID_URL, { tableId }),
          { selection: { excludeRecordIds: kept.map((row) => row.id) } },
          { validateStatus: () => true },
        );
        if (deleted.status < 200 || deleted.status >= 300) {
          const body = JSON.stringify(deleted.data ?? "");
          if (body.includes("validation_error")) {
            // Not the product: this case sent a shape the endpoint does not
            // accept, and the run should be read that way. It happened once,
            // with the excluded ids at the top level instead of inside
            // `selection` (run 34575590980).
            throw new Error(
              `the delete request was refused as malformed (${deleted.status}): ${body} - this is the case sending ` +
                "the wrong shape, not the product deleting the wrong rows",
            );
          }
          throw new Error(
            `deleting everything except ${keptNames.length} rows answered ${deleted.status}: ${body}`,
          );
        }

        const remaining = await apiGetRowCount(tableId, {});
        if (remaining.data.rowCount !== keptNames.length) {
          throw new Error(
            `after deleting everything except ${keptNames.length} rows, ${remaining.data.rowCount} rows are left - ` +
              `${remaining.data.rowCount - keptNames.length} of them were selected for deletion and are still there`,
          );
        }
        const after = await readWhatIsLeft();
        const left = [...after.names].sort();
        const expected = [...keptNames].sort();
        if (JSON.stringify(left) !== JSON.stringify(expected)) {
          const survived = left.filter((name) => !expected.includes(name));
          throw new Error(
            `after deleting everything except ${JSON.stringify(expected)}, the table holds ${JSON.stringify(left)}` +
              (survived.length > 0
                ? ` - ${survived.length} row(s) nobody unselected are still there`
                : " - rows that were unselected were deleted anyway"),
          );
        }
        return { left, answered: deleted.data };
      },
    );

    return {
      details: {
        tableId,
        routing,
        rowCount: config.rowCount,
        kept: keptNames,
        left: probe.left,
        answer: probe.answered,
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
