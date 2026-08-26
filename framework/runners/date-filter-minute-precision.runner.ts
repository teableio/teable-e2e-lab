import {
  and,
  DateFormattingPreset,
  exactFormatDate,
  FieldKeyType,
  FieldType,
  isAfter,
  TimeFormatting,
} from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DateFilterMinutePrecisionCaseConfig } from "../types";

// Rows a few minutes apart -> filter for the ones after a particular minute ->
// checkpoint: exactly those come back.
//
// A date column that shows the time is used for things that happen during a
// day: shifts, deliveries, calls. Filtering to "after 23:36" is the ordinary
// use of such a column, and the minute is the whole point - a person picking
// that time means it.
//
// The time was thrown away and only the day compared. Everything on the same
// day landed on the same side of the line, so the filter either kept rows it
// should have dropped or dropped the lot - and the rows it returns look right,
// because they are all from the day that was asked about.
//
// One row on each side of the minute, and the two are minutes apart: a filter
// that compares only the day cannot tell them apart, and one that compares the
// minute has to.

const NAME_FIELD = "Name";
const WHEN_FIELD = "When";

export const runDateFilterMinutePrecisionCase = async (
  bugCase: BugCaseFor<"date-filter-minute-precision">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DateFilterMinutePrecisionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const cutoff = Date.parse(config.after);
  const expectedNames = config.rows
    .filter((row) => Date.parse(row.at) > cutoff)
    .map((row) => row.name)
    .sort();
  const droppedNames = config.rows
    .filter((row) => Date.parse(row.at) <= cutoff)
    .map((row) => row.name)
    .sort();
  if (expectedNames.length === 0 || droppedNames.length === 0) {
    throw new Error(
      "one row on each side of the minute at least - otherwise a filter that keeps everything, or nothing, looks correct",
    );
  }
  const days = new Set(config.rows.map((row) => row.at.slice(0, 10)));
  if (days.size !== 1) {
    throw new Error(
      `the rows fall on ${days.size} days - they have to share one, or comparing only the day would give the right answer`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: WHEN_FIELD,
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
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [WHEN_FIELD]: row.at },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const whenFieldId = table.fields.find(
      (field: { name: string }) => field.name === WHEN_FIELD,
    )?.id;
    if (!viewId || !whenFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: unfiltered, every row is
    // there. A table short of rows would make the filtered answer unreadable.
    const all = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId,
      take: config.rows.length,
    });
    if (all.data.records.length !== config.rows.length) {
      throw new Error(
        `the table lists ${all.data.records.length} of ${config.rows.length} rows before any filter`,
      );
    }

    // Control, still outside the checkpoint: the same filter written the same
    // way, with a cutoff before every row, has to return every row. Without it
    // an empty answer below could be this case asking the question wrongly
    // rather than the product answering it wrongly.
    const controlAfter = new Date(
      Math.min(...config.rows.map((row) => Date.parse(row.at))) - 60_000,
    ).toISOString();
    const control = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId,
      take: config.rows.length,
      filter: {
        conjunction: and.value,
        filterSet: [
          {
            fieldId: whenFieldId,
            operator: isAfter.value,
            value: {
              mode: exactFormatDate.value,
              exactDate: controlAfter,
              timeZone: config.timeZone,
            },
          },
        ],
      },
    });
    if (control.data.records.length !== config.rows.length) {
      throw new Error(
        `asked for the rows after ${controlAfter}, which is before all of them, the filter returned ` +
          `${control.data.records.length} of ${config.rows.length} - this case is not asking the question the way the product expects it`,
      );
    }

    const probe = await bugCheckpoint(
      "a-time-of-day-filter-compares-the-minute",
      async () => {
        const filtered = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId,
          take: config.rows.length,
          filter: {
            conjunction: and.value,
            filterSet: [
              {
                fieldId: whenFieldId,
                operator: isAfter.value,
                value: {
                  mode: exactFormatDate.value,
                  exactDate: config.after,
                  timeZone: config.timeZone,
                },
              },
            ],
          },
        });
        const found = filtered.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
          )
          .sort();
        if (found.join(" ") !== expectedNames.join(" ")) {
          throw new Error(
            `filtering to the rows after ${config.after} returned [${found.join(", ")}], expected [${expectedNames.join(", ")}] - ` +
              (found.length === config.rows.length
                ? "everything on that day came back, so only the day was compared and the minute was thrown away"
                : "the rows are minutes apart and the filter did not separate them there"),
          );
        }
        return { found };
      },
    );

    return {
      details: {
        tableId,
        after: config.after,
        timeZone: config.timeZone,
        found: probe.found,
        dropped: droppedNames,
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
