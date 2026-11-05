import { FieldType } from "@teable/core";
import { axios } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  SearchMatchesScopeCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess } from "./raw-api";

// A table whose only matches for a search sit in its last rows -> one
// search-matches request, as the grid sends it -> checkpoint: the answer
// carries exactly those rows.
//
// The grid finds hits page by page and highlights them inside the rows a
// person has selected. Two shapes broke it on large tables:
//
// - sparse-tail: a page counted view rows instead of matching rows, so the
//   first page of a search whose hits are all at the end came back empty and
//   the grid kept asking - the search spun.
// - large-highlight-scope: the selected record ids travelled in the query
//   string, so selecting around a thousand rows made the request too large to
//   be accepted at all.
//
// The request follows the revision under test: the body form when the route
// accepts it, otherwise the query-string form older revisions only knew.

const NAME = "Name";

type SearchMatchesVo = {
  matches?: { recordId: string; fieldId: string; index: number }[];
  hasMore?: boolean;
  nextSkip?: number | null;
};

export const runSearchMatchesScopeCase = async (
  bugCase: BugCaseFor<"search-matches-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SearchMatchesScopeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  if (config.needleRows < 1 || config.needleRows > config.rowCount) {
    throw new Error("needleRows must be between 1 and rowCount");
  }

  try {
    const firstNeedle = config.rowCount - config.needleRows;
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: Array.from({ length: config.rowCount }, (_, index) => ({
        fields: {
          [NAME]:
            index >= firstNeedle ? `${config.needle}-${index}` : `row-${index}`,
        },
      })),
    });
    tableIds.push(table.id);
    const nameId = table.fields[0].id;
    const viewId = table.views[0].id;
    const recordIds = (table.records as { id: string }[]).map((r) => r.id);
    if (recordIds.length !== config.rowCount) {
      throw new Error(
        `the table holds ${recordIds.length} rows, expected ${config.rowCount}`,
      );
    }
    const expected = recordIds.slice(firstNeedle).sort();

    const query = {
      viewId,
      take: config.take,
      search: [config.needle, nameId, false],
      ...(config.scenario === "large-highlight-scope"
        ? {
            projection: [nameId],
            selectedRecordIds: recordIds.slice(-config.selectedRecordCount),
          }
        : {}),
    };
    const url = `/table/${table.id}/aggregation/search-matches`;

    const probe = await bugCheckpoint(
      config.scenario === "sparse-tail"
        ? "the-first-search-page-reaches-matches-at-the-end"
        : "a-search-inside-a-large-selection-is-accepted",
      async () => {
        let response = await axios.post<SearchMatchesVo>(url, query, {
          validateStatus: () => true,
        });
        let form = "body";
        if (response.status === 404 || response.status === 405) {
          form = "query string";
          response = await axios.get<SearchMatchesVo>(url, {
            params: { ...query, search: query.search },
            validateStatus: () => true,
          });
        }
        if (!isSuccess(response)) {
          throw new Error(
            `the search-matches request (${form}, ${config.scenario === "large-highlight-scope" ? `${config.selectedRecordCount} selected ids` : `take ${config.take}`}) answered ${describeResponse(response)}`,
          );
        }
        const found = [
          ...new Set((response.data.matches ?? []).map((m) => m.recordId)),
        ].sort();
        if (JSON.stringify(found) !== JSON.stringify(expected)) {
          throw new Error(
            `the search returned ${found.length} matching rows, expected the last ${expected.length} ` +
              `(hasMore ${JSON.stringify(response.data.hasMore)}, nextSkip ${JSON.stringify(response.data.nextSkip)})` +
              (found.length === 0 && response.data.hasMore
                ? " - the page came back empty while saying there is more, so the grid keeps paging"
                : ""),
          );
        }
        return {
          form,
          matchedRows: found.length,
        };
      },
    );

    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
