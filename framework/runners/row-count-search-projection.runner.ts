import { FieldType } from "@teable/core";
import { getRowCount as apiGetRowCount } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RowCountSearchProjectionCaseConfig } from "../types";

// A view with a column hidden -> search it -> checkpoint: the number of
// results counts only the rows that match in a column the person can see.
//
// Hiding a column is how a view is made narrow enough to work in. The count
// next to the search box is the product's answer to "how much did this find",
// and the list underneath is the same answer written out.
//
// They disagreed. Rows that matched only in the hidden column were counted and
// not shown, so the count was larger than the list every time - and there is
// no way to reconcile them, because the rows making up the difference are
// exactly the ones the view is not showing. The person counts the rows on
// screen, gets a smaller number, and has nothing to do with that.

const TITLE_FIELD = "Title";
const NOTE_FIELD = "Note";

export const runRowCountSearchProjectionCase = async (
  bugCase: BugCaseFor<"row-count-search-projection">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RowCountSearchProjectionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const matchesVisible = config.rows.filter((row) =>
    row.title.includes(config.searchTerm),
  ).length;
  const matchesAnywhere = config.rows.filter(
    (row) =>
      row.title.includes(config.searchTerm) ||
      row.note.includes(config.searchTerm),
  ).length;
  if (matchesVisible < 1) {
    throw new Error(
      `no row matches ${JSON.stringify(config.searchTerm)} in the visible column - the expected count would be 0, which is also what a broken search returns`,
    );
  }
  if (matchesAnywhere <= matchesVisible) {
    throw new Error(
      `every row matching ${JSON.stringify(config.searchTerm)} matches it in the visible column - counting the hidden one would give the same number, so the case could never go red`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rows.map((row) => ({
        fields: { [TITLE_FIELD]: row.title, [NOTE_FIELD]: row.note },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const titleFieldId = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    )?.id;
    if (!viewId || !titleFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }
    const search: [string, string, boolean] = [config.searchTerm, "", true];

    // Fixture verification, outside the checkpoint: with nothing hidden, the
    // term is found in both columns. This is what makes the number below
    // readable - a smaller count with a column hidden is the hiding being
    // applied, rather than the search having quietly stopped matching.
    const whole = await apiGetRowCount(tableId, { viewId, search });
    if (whole.data.rowCount !== matchesAnywhere) {
      throw new Error(
        `searching every column counts ${whole.data.rowCount} rows, expected ${matchesAnywhere} - the term does not select what the fixture thinks it does`,
      );
    }

    const probe = await bugCheckpoint(
      "the-number-of-results-counts-only-what-is-shown",
      async () => {
        // The same search over a view that shows one column - which is what a
        // personal view with the other column hidden sends.
        const narrowed = await apiGetRowCount(tableId, {
          viewId,
          ignoreViewQuery: true,
          search,
          projection: [titleFieldId],
        });
        // Which engine answered is recorded rather than asserted. This fix
        // also moved row-count onto v2, so requiring v2 here would turn the
        // pre-fix column from "the bug reproduced" into "the lab could not
        // run" - which is what it did, run 32857293898.
        const routing = pickRoutingHeaders(narrowed.headers);
        if (narrowed.data.rowCount !== matchesVisible) {
          throw new Error(
            `with the other column hidden, the search counts ${narrowed.data.rowCount} rows and shows ${matchesVisible} - ` +
              `${matchesAnywhere - matchesVisible} of them match only in the hidden column, so the count cannot be reconciled with the list`,
          );
        }
        return { routing, rowCount: narrowed.data.rowCount };
      },
    );

    return {
      details: {
        tableId,
        searchTerm: config.searchTerm,
        matchesAnywhere,
        matchesVisible,
        countedWhenNarrowed: probe.rowCount,
        routing: probe.routing,
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
