import { FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  TqlEmptyDateCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A table with one dated row and one undated row -> list it with a TQL filter
// comparing the date column to the empty string, both ways -> checkpoint:
// each query answers, `!= ""` returns the dated row and `= ""` the undated one.
//
// "Has a due date" written as {Due Date} != "" is how people and generated
// queries say it. The comparison went to the database as a timestamp compared
// with text, which the database refuses, so the whole list request failed -
// not a wrong filter but no rows at all, for a question that has an obvious
// answer.

const NAME_FIELD = "Name";
const DATE_FIELD = "Due Date";

export const runTqlEmptyDateCase = async (
  bugCase: BugCaseFor<"tql-empty-date">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TqlEmptyDateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: DATE_FIELD, type: FieldType.Date },
      ],
      records: [
        {
          fields: { [NAME_FIELD]: config.datedRow, [DATE_FIELD]: config.date },
        },
        { fields: { [NAME_FIELD]: config.undatedRow } },
      ],
    });
    tableIds.push(table.id);
    const list = (filterByTql?: string) =>
      rawRequest<{ records?: { fields: Record<string, unknown> }[] }>(
        "GET",
        `/table/${table.id}/record?${new URLSearchParams({
          fieldKeyType: "name",
          ...(filterByTql ? { filterByTql } : {}),
        }).toString()}`,
      );
    const all = await list();
    assertServedByV2(all.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if ((all.data.records ?? []).length !== 2) {
      throw new Error(
        "both rows have to be listed before any filter is applied",
      );
    }

    const probe = await bugCheckpoint(
      "a-date-compared-with-the-empty-string-filters-instead-of-failing",
      async () => {
        const cases: [string, string[]][] = [
          [`{${DATE_FIELD}} != ""`, [config.datedRow]],
          [`{${DATE_FIELD}} = ""`, [config.undatedRow]],
        ];
        const problems: string[] = [];
        const seen: Record<string, unknown> = {};
        for (const [tql, expected] of cases) {
          const response = await list(tql);
          if (!isSuccess(response)) {
            problems.push(`${tql} answered ${describeResponse(response)}`);
            continue;
          }
          const names = (response.data.records ?? [])
            .map((record) => String(record.fields[NAME_FIELD]))
            .sort();
          seen[tql] = names;
          if (JSON.stringify(names) !== JSON.stringify(expected)) {
            problems.push(
              `${tql} returned ${JSON.stringify(names)}, expected ${JSON.stringify(expected)}`,
            );
          }
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return seen;
      },
    );

    return { details: { tableId: table.id, results: probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
