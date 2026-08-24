import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
} from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { IsWithinTodayFilterCaseConfig } from "../types";

// A filter that says "today" -> checkpoint: today's rows come back, and only
// those.
//
// A relative filter is the only kind that keeps working tomorrow. "Due today",
// "this week", "in the last month" are how a working view is written, because
// the alternative - a fixed date - is wrong the next morning and has to be
// edited by hand every day.
//
// Asking for today was not understood, so the answer was everything or
// nothing. Both are quiet: a view that shows every row looks like a view
// somebody forgot to filter, and an empty one looks like a quiet day.
//
// The fixture puts a row on each side of today - yesterday and tomorrow - so
// neither of those two wrong answers can pass.

const NAME_FIELD = "Name";
const DATE_FIELD = "Due";

export const runIsWithinTodayFilterCase = async (
  bugCase: BugCaseFor<"is-within-today-filter">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: IsWithinTodayFilterCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  // Midday, so the rows sit well inside their own day whichever way the
  // boundaries are worked out.
  const now = new Date();
  const middayToday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  );
  const dayBefore = new Date(middayToday);
  dayBefore.setUTCDate(middayToday.getUTCDate() - 1);
  const dayAfter = new Date(middayToday);
  dayAfter.setUTCDate(middayToday.getUTCDate() + 1);

  const rows = [
    { name: config.yesterdayRowTitle, when: dayBefore.toISOString() },
    { name: config.todayRowTitle, when: middayToday.toISOString() },
    { name: config.tomorrowRowTitle, when: dayAfter.toISOString() },
  ];

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.Hour24,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [DATE_FIELD]: row.when },
      })),
    });
    tableId = table.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    if (!dateFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: all three rows are there,
    // so an empty answer later is the filter rather than the table.
    const all = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: rows.length,
    });
    if (all.data.records.length !== rows.length) {
      throw new Error(
        `the table holds ${all.data.records.length} rows, expected ${rows.length} - the fixture is not in ` +
          "place",
      );
    }

    const probe = await bugCheckpoint(
      "a-filter-that-says-today-answers-with-today",
      async () => {
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: rows.length,
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: dateFieldId,
                operator: "isWithIn",
                value: { mode: "today", timeZone: config.timeZone },
              },
            ],
          },
        });
        const routing = assertServedByV2(read.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const names = read.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD] ?? ""),
          )
          .sort();
        if (names.join(",") !== config.todayRowTitle) {
          throw new Error(
            `asking for today returned ${JSON.stringify(names)}, expected only ` +
              `${JSON.stringify(config.todayRowTitle)}` +
              (names.length === 0
                ? " - an empty answer reads as a quiet day"
                : names.length === rows.length
                  ? " - every row came back, which reads as a view somebody forgot to filter"
                  : ""),
          );
        }
        return { routing, names };
      },
    );

    return {
      details: { tableId, returned: probe.names, routing: probe.routing },
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
