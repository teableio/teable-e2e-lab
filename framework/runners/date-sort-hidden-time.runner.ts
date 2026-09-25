import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  SortFunc,
  TimeFormatting,
} from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DateSortHiddenTimeCaseConfig } from "../types";

// A date column formatted to show the day only -> several rows on the same
// day at different hours -> checkpoint: sorting by it follows the full stored
// time, not the day on screen.
//
// Hiding the hour is a display choice. The sort took it as an instruction: it
// compared the day each row shows, so every row on the same day tied, and the
// tie was broken by the order the rows were added. Switch the hour back on and
// the same sort gives a different order - which is how it was noticed.
//
// The rows are added in an order unrelated to their times, so falling back to
// the order they were added cannot pass for the right answer. One row sits on
// the previous day so a sort that ignores the dates altogether is caught too.

const NAME_FIELD = "Name";
const DATE_FIELD = "When";

export const runDateSortHiddenTimeCase = async (
  bugCase: BugCaseFor<"date-sort-hidden-time">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DateSortHiddenTimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  // The expected order is worked out from the stored times, locally.
  const expected = [...config.rows]
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
    .map((row) => row.name);
  const added = config.rows.map((row) => row.name);
  if (expected.join(" ") === added.join(" ")) {
    throw new Error(
      "the rows are added in time order already - a sort that fell back to the order they were added would look correct",
    );
  }
  if (new Set(config.rows.map((row) => row.at)).size !== config.rows.length) {
    throw new Error("two rows share a time - their order is not defined");
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [DATE_FIELD]: row.at },
      })),
    });
    tableId = table.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    const nameFieldId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id;
    if (!dateFieldId || !nameFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readSorted = async () =>
      apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: config.rows.length + 1,
        orderBy: [{ fieldId: dateFieldId, order: SortFunc.Asc }],
      });

    // Fixture verification, outside the checkpoint: every row holds the full
    // time it was given, hour and minute included. If the hour were lost on
    // the way in, there would be nothing for the sort to get wrong.
    const first = await readSorted();
    const routing = assertServedByV2(first.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const stored = new Map<string, string>(
      first.data.records.map((record: { fields: Record<string, unknown> }) => [
        String(record.fields[nameFieldId]),
        String(record.fields[dateFieldId] ?? ""),
      ]),
    );
    for (const row of config.rows) {
      const value = stored.get(row.name) ?? "";
      if (Date.parse(value) !== Date.parse(row.at)) {
        throw new Error(
          `row ${row.name} holds ${JSON.stringify(value)}, not the ${row.at} it was given`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "sorting-by-a-day-only-date-follows-the-stored-time",
      async () => {
        const sorted = await readSorted();
        const order = sorted.data.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[nameFieldId]),
        );
        if (order.join(" ") !== expected.join(" ")) {
          const withTimes = (names: string[]) =>
            names.map((name) => `${name}(${stored.get(name)})`);
          throw new Error(
            `sorting by a date column that hides the hour put the rows in ${JSON.stringify(withTimes(order))}, ` +
              `but their stored times order them ${JSON.stringify(withTimes(expected))} - ` +
              "rows on the same day were ordered by when they were added, not by their time",
          );
        }
        return { order };
      },
    );

    return {
      details: { tableId, routing, sortedOrder: probe.order },
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
