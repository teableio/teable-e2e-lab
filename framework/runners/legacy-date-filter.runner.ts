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

// Filter a date column by a plain date string -> checkpoint: the rows on that
// date come back.
//
// A date filter has a shape - a mode, a date, a time zone - and v1 also took
// the date on its own. Integrations written against v1 send that: a saved
// view's filter migrated forward, a script that builds a query string, a
// report that asks for "everything dated the 12th".
//
// v2 did not recognise the bare string, so the filter matched nothing. That is
// the worst way for a filter to fail: an empty result reads as "there is
// nothing there", and a report built on it is quietly wrong rather than
// visibly broken.
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

  const wanted = config.rows.filter((row) => row.date === config.filterDate);
  const others = config.rows.filter((row) => row.date !== config.filterDate);
  if (wanted.length < 1 || others.length < 1) {
    throw new Error(
      "the fixture needs a row on the filtered date and a row on another one - otherwise an empty answer " +
        "and an unfiltered one cannot both be caught",
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
                // The bare string, the way a v1-era client sends it.
                value: config.filterDate,
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
