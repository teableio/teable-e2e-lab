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
import type { LegacyDateFilterCaseConfig } from "../types";

// Filter a date column by one date -> checkpoint: the rows on that day come
// back, and only those.
//
// A date filter has a shape - a mode, a date, a time zone - and v1 also took
// the date on its own. Integrations written against v1 send that: a saved
// view's filter migrated forward, a script that builds a query string, a
// report that asks for "everything dated the 12th".
//
// Two ways to send that date, and each had its own failure:
//
//   plainString (T5584): v2 did not recognise the bare string, so the filter
//     matched nothing.
//   exactDateWithZone (T5583): the structured value the filter panel saves
//     carries the zone that decides which day the date is, and matching
//     ignored it - so east of UTC the filter answered with the neighbouring
//     day.
//
// Both are the worst way for a filter to fail: the answer is a plausible list
// of rows, and a report built on it is quietly wrong rather than visibly
// broken.
//
// The fixture holds rows on two different days, so an empty answer and an
// unfiltered one are both wrong in a way the assertion can see.

const NAME_FIELD = "Name";
const DATE_FIELD = "When";

export const runLegacyDateFilterCase = async (
  bugCase: BugCaseFor<"legacy-date-filter">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LegacyDateFilterCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  // "is" on a date column means the same day, not the same instant - measured
  // on develop in run 32664447076, where a filter naming 09:00 returned the
  // row at 18:30 as well. So the expectation is computed by day, in the
  // column's own zone, and the fixture keeps two rows on the filtered day at
  // different times to hold that distinction in place.
  const dayOf = (value: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(value));
  const filterDay = dayOf(config.filterDate);
  const wanted = config.rows.filter((row) => dayOf(row.date) === filterDay);
  const others = config.rows.filter((row) => dayOf(row.date) !== filterDay);
  if (wanted.length < 2 || others.length < 1) {
    throw new Error(
      "the fixture needs at least two rows on the filtered day - at different times, so a filter matching " +
        "the instant rather than the day is caught - and at least one row on another day",
    );
  }
  if (new Set(wanted.map((row) => row.date)).size !== wanted.length) {
    throw new Error(
      "the rows on the filtered day have to be at different times, or matching the instant and matching " +
        "the day look the same",
    );
  }

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
              time: TimeFormatting.None,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [DATE_FIELD]: row.date },
      })),
    });
    tableId = table.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    if (!dateFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: every row landed. A filter
    // returning nothing is the failure under test, so the table has to be
    // known to hold something first.
    const all = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rows.length,
    });
    const routing = assertServedByV2(all.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (all.data.records.length !== config.rows.length) {
      throw new Error(
        `the table holds ${all.data.records.length} rows, expected ${config.rows.length} - the fixture is ` +
          "not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-plain-date-string-filters-a-date-column",
      async () => {
        const filtered = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rows.length,
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: dateFieldId,
                operator: "is",
                value:
                  config.filterValue === "plainString"
                    ? // The bare string, the way a v1-era client sends it.
                      config.filterDate
                    : // The shape the filter panel saves: a date and the zone
                      // that decides which day it is.
                      {
                        mode: "exactDate",
                        exactDate: config.filterDate,
                        timeZone: config.timeZone,
                      },
              },
            ],
          },
        });
        const names = filtered.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD] ?? ""),
          )
          .sort();
        const expected = wanted.map((row) => row.name).sort();
        if (names.join(",") !== expected.join(",")) {
          throw new Error(
            `filtering by ${JSON.stringify(config.filterDate)} returned ${JSON.stringify(names)}, expected ` +
              `${JSON.stringify(expected)}` +
              (names.length === 0
                ? " - an empty answer reads as: there is nothing there"
                : names.length === 1
                  ? " - one row is the instant, not the day"
                  : ""),
          );
        }
        return { names };
      },
    );

    return {
      details: {
        tableId,
        routing,
        filterDate: config.filterDate,
        returned: probe.names,
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
