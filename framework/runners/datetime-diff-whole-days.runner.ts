import { FieldKeyType, FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  DatetimeDiffWholeDaysCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A date-only event column in one time zone, a start column, and a formula in
// another time zone computing DATETIME_DIFF in days -> rows whose intervals
// are 44 hours either way and 20 hours either way -> checkpoint: the formula
// counts complete days only: 1, -1, 0 and 0.
//
// "How many days until" is one of the most common formulas people write, and
// it rounded instead of truncating: a deadline 44 hours away read as 2 days, a
// 20-hour gap as 1, and the sign of a past date flipped the rounding the other
// way. The time zones differ on purpose, because that is where a date-only
// column and a formula disagree about where a day starts.

const NAME = "Name";

export const runDatetimeDiffWholeDaysCase = async (
  bugCase: BugCaseFor<"datetime-diff-whole-days">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DatetimeDiffWholeDaysCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: "Event",
          type: FieldType.Date,
          options: {
            formatting: {
              date: "YYYY-MM-DD",
              time: "None",
              timeZone: config.eventTimeZone,
            },
          },
        },
        { name: "Start", type: FieldType.Date },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME]: row.name, Event: row.event, Start: config.start },
      })),
    });
    tableIds.push(table.id);
    const eventId = table.fields[1].id;
    const startId = table.fields[2].id;

    const probe = await bugCheckpoint(
      "datetime-diff-in-days-counts-complete-days",
      async () => {
        const created = await rawRequest<{ id?: string }>(
          "POST",
          `/table/${table.id}/field`,
          {
            name: "Days",
            type: FieldType.Formula,
            options: {
              expression: `DATETIME_DIFF({${eventId}}, {${startId}}, 'day')`,
              timeZone: config.formulaTimeZone,
            },
          },
        );
        if (!isSuccess(created) || !created.data?.id) {
          throw new Error(
            `creating the formula answered ${describeResponse(created)}`,
          );
        }
        const formulaId = created.data.id;
        const read = await rawRequest<{
          records: { fields: Record<string, unknown> }[];
        }>("GET", `/table/${table.id}/record?fieldKeyType=${FieldKeyType.Id}`);
        const byName = new Map(
          (read.data.records ?? []).map((record) => [
            String(record.fields[table.fields[0].id]),
            record.fields[formulaId] ?? null,
          ]),
        );
        const wrong = config.rows
          .filter((row) => byName.get(row.name) !== row.days)
          .map(
            (row) =>
              `${row.name} reads ${JSON.stringify(byName.get(row.name))}, expected ${row.days}`,
          );
        if (wrong.length > 0) {
          throw new Error(
            `DATETIME_DIFF in days did not count complete days: ${wrong.join("; ")}`,
          );
        }
        return { values: Object.fromEntries(byName) };
      },
    );
    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
