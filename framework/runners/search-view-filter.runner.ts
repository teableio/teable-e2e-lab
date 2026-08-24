import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  is,
  TimeFormatting,
} from "@teable/core";
import {
  getRecords as apiGetRecords,
  getSearchCount,
  getSearchIndex,
  updateViewFilter as apiUpdateViewFilter,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2, pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SearchViewFilterCaseConfig } from "../types";

// Seed a table whose rows cross two independent axes -> save a view filter
// that keeps one half of the first axis -> checkpoint: search the view by
// viewId and prove both the count and the hit list stay inside the filter.
//
// The two axes are the whole design. A row is inside or outside the saved
// filter, and it is matched or not matched by the search term, and the four
// quadrants make every wrong answer distinguishable from every other one:
// a search that ignores the filter over-counts by the outside-and-matched
// rows, a filter that ignores the search over-counts by the inside-and-not-
// matched ones, and a search that has simply stopped finding anything counts
// zero. One number can only tell those apart because all three quadrants are
// populated - which is why the runner refuses a fixture that leaves one empty.
//
// The searched field is a single-select and the term is one of its choice
// names, so "matched" is a property of the fixture rather than of substring
// behavior nobody is testing here.

const NAME_FIELD = "Name";
const DATE_FIELD = "When";
const REGION_FIELD = "Region";
const TYPE_FIELD = "Type";
const KEPT_REGION = "Keep";
const DROPPED_REGION = "Drop";
const OTHER_TYPE = "Other";

type Row = SearchViewFilterCaseConfig["rows"][number];

// Every quadrant this case reads has to exist, and the reasons differ:
//
//   - inside AND matched is the answer itself. Without it the expected count
//     is zero, and zero is what a completely broken search returns too.
//   - outside AND matched is the over-count the bug produces. Without it the
//     whole-table search and the view search return the same number and a red
//     column is impossible.
//   - inside AND NOT matched keeps "the search ran" separate from "the filter
//     ran": without it the view's row count equals the expected hit count, so
//     a query that ignored the search term entirely would still be right.
//
// The outside-and-not-matched quadrant is the only optional one - nothing
// reads it - so it is not required here.
export const rowProblems = (rows: Row[]): string[] => {
  const problems: string[] = [];
  const has = (inView: boolean, matches: boolean) =>
    rows.some((row) => row.inView === inView && row.matches === matches);

  if (!has(true, true)) {
    problems.push(
      "no row is both inside the view filter and matched by the search term - the expected hit count would be 0, which is also what a search that finds nothing returns",
    );
  }
  if (!has(false, true)) {
    problems.push(
      "no row is outside the view filter but matched by the search term - there would be nothing for a filter-ignoring search to over-count, so the case could never go red",
    );
  }
  if (!has(true, false)) {
    problems.push(
      "no row is inside the view filter but unmatched by the search term - the view's row count would equal the expected hit count, so a query that ignored the search term would still look correct",
    );
  }

  const names = rows.map((row) => row.name);
  if (new Set(names).size !== names.length) {
    problems.push(
      `row names must be unique - got [${names.join(", ")}] and the runner keys record ids by name`,
    );
  }

  return problems;
};

export const runSearchViewFilterCase = async (
  bugCase: BugCaseFor<"search-view-filter">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SearchViewFilterCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const problems = rowProblems(config.rows);
  if (problems.length > 0) {
    throw new Error(
      `the fixture cannot answer the question this case asks:\n- ${problems.join("\n- ")}`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText },
        {
          name: REGION_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [{ name: KEPT_REGION }, { name: DROPPED_REGION }],
          },
        },
        {
          name: TYPE_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [{ name: config.searchTerm }, { name: OTHER_TYPE }],
          },
        },
        // A date column, present only in the every-field shape: searching
        // every field means the date column is searched too, and that is what
        // dropped the view's filter (T6916). It carries no part of the
        // fixture's meaning - the two axes stay the region and the type.
        ...(config.scope === "everyField"
          ? [
              {
                name: DATE_FIELD,
                type: FieldType.Date,
                options: {
                  formatting: {
                    date: DateFormattingPreset.ISO,
                    time: TimeFormatting.None,
                    timeZone: "UTC",
                  },
                },
              },
            ]
          : []),
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [REGION_FIELD]: row.inView ? KEPT_REGION : DROPPED_REGION,
          [TYPE_FIELD]: row.matches ? config.searchTerm : OTHER_TYPE,
          ...(config.scope === "everyField"
            ? { [DATE_FIELD]: "2026-03-01T00:00:00.000Z" }
            : {}),
        },
      })),
    });
    tableId = table.id;

    const viewId = table.defaultViewId;
    const regionField = table.fields.find(
      (field: { name: string }) => field.name === REGION_FIELD,
    );
    const typeField = table.fields.find(
      (field: { name: string }) => field.name === TYPE_FIELD,
    );
    if (!viewId || !regionField || !typeField) {
      throw new Error(`Table ${tableId} is missing its fixture view or fields`);
    }

    const idByName = new Map<string, string>(
      (table.records ?? []).map((record: { id: string; fields: unknown }) => [
        String((record.fields as Record<string, unknown>)[NAME_FIELD]),
        record.id,
      ]),
    );
    if (idByName.size !== config.rows.length) {
      throw new Error(
        `Seed did not land: created ${idByName.size} rows, expected ${config.rows.length}`,
      );
    }

    // Naming a field searches that field. Sending the term on its own is the
    // search box at the top of the grid: every field at once, the date column
    // included - which is the shape where the view's filter was dropped
    // (T6916).
    const search: [string, string, boolean] | [string] =
      config.scope === "everyField"
        ? [config.searchTerm]
        : [config.searchTerm, typeField.id, true];
    const expectedNames = config.rows
      .filter((row) => row.inView && row.matches)
      .map((row) => row.name)
      .sort();
    const wholeTableMatches = config.rows.filter((row) => row.matches).length;
    const inViewNames = config.rows
      .filter((row) => row.inView)
      .map((row) => row.name)
      .sort();

    // Save the filter, still in setup, and take the routing proof from its
    // response. The bug is that a stored view filter is ignored, so a filter
    // stored by some other engine than the one under test would leave the
    // checkpoint watching the wrong thing.
    //
    // The proof is deliberately NOT taken from the search response, even
    // though that is where the bug lives, because this fix also moved
    // search-count and search-index onto v2 as part of fixing them. Asserting
    // v2 there would turn the pre-fix column from "the bug reproduced" into
    // "the lab could not run", and a case that cannot go red proves nothing.
    // The engines that answered the search are recorded below as data instead.
    const filterResponse = await apiUpdateViewFilter(tableId, viewId, {
      filter: {
        conjunction: "and",
        filterSet: [
          {
            fieldId: regionField.id,
            operator: is.value,
            value: KEPT_REGION,
          },
        ],
      },
    });
    const routing = assertServedByV2(filterResponse.headers, {
      operation: "PUT /table/{tableId}/view/{viewId}/filter",
      feature: "updateViewFilter",
    });

    // Fixture verification, outside the checkpoint: the saved filter is live
    // on plain reads. Everything the checkpoint asserts is "search agrees with
    // the view", so a view that was not filtering in the first place would
    // make the checkpoint agree with nothing.
    const viewRows = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId,
      take: config.rows.length,
    });
    const viewNames = viewRows.data.records
      .map((record: { fields: Record<string, unknown> }) =>
        String(record.fields[NAME_FIELD]),
      )
      .sort();
    if (viewNames.join(" ") !== inViewNames.join(" ")) {
      throw new Error(
        `the saved view filter is not live: the view returned [${viewNames.join(", ")}], expected [${inViewNames.join(", ")}]`,
      );
    }

    // The other half of the fixture, also outside the checkpoint: asked to
    // ignore the view, the same search finds every matched row in the table.
    // This is what makes the checkpoint's number readable - it proves the
    // search term itself works and that the rows the view hides are findable,
    // so a smaller number inside the view is the filter being applied rather
    // than the search having quietly stopped matching. Ignoring the view is
    // correct behavior on both sides of the fix, so it belongs out here.
    const wholeTable = await getSearchCount(tableId, {
      viewId,
      ignoreViewQuery: true,
      search,
    });
    if (wholeTable.data.count !== wholeTableMatches) {
      throw new Error(
        `the whole-table search found ${wholeTable.data.count} rows, expected ${wholeTableMatches} - the search term does not select what the fixture thinks it does`,
      );
    }

    const probe = await bugCheckpoint(
      "search-by-view-id-stays-inside-the-view-filter",
      async () => {
        const counted = await getSearchCount(tableId, { viewId, search });
        if (counted.data.count !== expectedNames.length) {
          throw new Error(
            `search-count returned ${counted.data.count} for view ${viewId}, expected ${expectedNames.length} - ` +
              `the whole table holds ${wholeTableMatches} matching rows, so the search ran outside the view's filter`,
          );
        }

        // The count alone can be right for the wrong reason: drop one row the
        // view keeps, add one it hides, and the total is unchanged. The hit
        // list names which rows answered.
        const indexed = await getSearchIndex(tableId, {
          viewId,
          take: config.rows.length,
          search,
        });
        const hitIds = [
          ...new Set((indexed.data ?? []).map((hit) => hit.recordId)),
        ];
        const hitNames = hitIds
          .map((id) => {
            const found = [...idByName.entries()].find(
              ([, recordId]) => recordId === id,
            );
            return found ? found[0] : `(unknown ${id})`;
          })
          .sort();
        if (hitNames.join(" ") !== expectedNames.join(" ")) {
          throw new Error(
            `search-index returned hits on [${hitNames.join(", ")}] for view ${viewId}, expected [${expectedNames.join(", ")}]`,
          );
        }

        return {
          count: counted.data.count,
          hitNames,
          // Which engine actually answered each search, kept as data rather
          // than asserted - see the routing note above. Post-fix these read
          // v2; on the fix's parent they read v1, which is itself part of the
          // story a red column tells.
          countRouting: pickRoutingHeaders(counted.headers),
          indexRouting: pickRoutingHeaders(indexed.headers),
        };
      },
    );

    return {
      details: {
        tableId,
        tableName,
        viewId,
        routing,
        searchTerm: config.searchTerm,
        expectedNames,
        wholeTableMatches,
        ...probe,
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
