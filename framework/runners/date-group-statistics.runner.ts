import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  SortFunc,
  StatisticsFunc,
  TimeFormatting,
} from "@teable/core";
import {
  getAggregation as apiGetAggregation,
  getRecords as apiGetRecords,
  GroupPointType,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DateGroupStatisticsCaseConfig } from "../types";

// A table grouped by a date column -> ask for the total of a number column per
// group, the way a grid asks for the figure it prints in each group heading ->
// checkpoint: every heading gets its total, and the totals are of the rows
// under that heading.
//
// A date column is grouped by what it is formatted as: a column showing a day
// puts everything that happened that day under one heading, a column showing a
// month puts a whole month under one. That is what the headings say, and the
// rows arrive under them correctly.
//
// The totals were worked out from the raw timestamp instead. Two rows on the
// same day but at different times became two different groups nobody asked
// for, so the totals were keyed by groups that do not exist on screen and the
// headings the grid does draw got nothing - blank where a number belongs. The
// total at the foot of the table stays right, which is what makes this easy to
// disbelieve and hard to report.
//
// The rows must straddle the unit: times that differ inside one day for a day
// column, days that differ inside one month for a month column. Rows that
// share their raw timestamp would group the same either way and the case would
// be green on both sides. The runner refuses a fixture that does not straddle.

const NAME_FIELD = "Title";
const AMOUNT_FIELD = "Amount";
const DATE_FIELD = "When";

// The bucket a row falls into, in the field's own timezone - which is how the
// list groups it. Derived locally so a rerun compares byte for byte.
const bucketOf = (iso: string, timeZone: string, unit: "day" | "month") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const day = `${value("year")}-${value("month")}-${value("day")}`;
  return unit === "month" ? day.slice(0, 7) : day;
};

export const runDateGroupStatisticsCase = async (
  bugCase: BugCaseFor<"date-group-statistics">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DateGroupStatisticsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const buckets = config.rows.map((row) =>
    bucketOf(row.at, config.timeZone, config.unit),
  );
  const expectedGroups = new Set(buckets).size;
  if (expectedGroups < 2) {
    throw new Error(
      "the rows have to fall into at least two buckets, or one heading carrying the whole total looks correct",
    );
  }
  // At least one bucket has to hold two rows written at different instants.
  // That is the whole disagreement: grouping by the formatted value puts them
  // together, grouping by the raw timestamp splits them. A fixture where every
  // bucket holds one row groups the same either way and is green on both
  // sides.
  const straddles = [...new Set(buckets)].some((bucket) => {
    const instants = new Set(
      config.rows
        .filter((_, index) => buckets[index] === bucket)
        .map((row) => row.at),
    );
    return instants.size > 1;
  });
  if (!straddles) {
    throw new Error(
      `no ${config.unit} here holds two rows written at different times - grouping by the raw timestamp and ` +
        "grouping by the formatted value would agree, and the case could not tell them apart",
    );
  }

  // The number each heading should print, and the one at the foot of the
  // table. Both derived from the same rows, locally.
  const expectedByBucket = new Map<string, number>();
  config.rows.forEach((row, index) => {
    const bucket = buckets[index]!;
    expectedByBucket.set(
      bucket,
      (expectedByBucket.get(bucket) ?? 0) + row.amount,
    );
  });
  const expectedGroupSums = [...expectedByBucket.values()].sort(
    (left, right) => left - right,
  );
  const expectedTotal = config.rows.reduce((sum, row) => sum + row.amount, 0);

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date:
                config.unit === "month"
                  ? DateFormattingPreset.YM
                  : DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.title,
          [AMOUNT_FIELD]: row.amount,
          [DATE_FIELD]: row.at,
        },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const amountFieldId = table.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    if (!viewId || !amountFieldId || !dateFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }
    const groupBy = [{ fieldId: dateFieldId, order: SortFunc.Asc }];

    // Fixture verification, outside the checkpoint: the list really groups the
    // rows the way the column is formatted, so there are headings for the
    // totals to be missing from. This is the side that was always right.
    const grouped = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      viewId,
      groupBy,
      take: config.rows.length,
    });
    assertServedByV2(grouped.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const headers = (
      ((grouped.data.extra as { groupPoints?: { type: number }[] })
        ?.groupPoints ?? []) as { type: number; id: string; depth?: number }[]
    ).filter(
      (point) =>
        point.type === GroupPointType.Header && (point.depth ?? 0) === 0,
    );
    if (headers.length !== expectedGroups) {
      throw new Error(
        `the grouped list shows ${headers.length} headings, expected ${expectedGroups} for a column formatted as a ` +
          `${config.unit} in ${config.timeZone} - the fixture is not grouped as declared`,
      );
    }

    const probe = await bugCheckpoint(
      "every-date-group-heading-carries-its-total",
      async () => {
        const response = await apiGetAggregation(tableId, {
          viewId,
          groupBy,
          field: { [StatisticsFunc.Sum]: [amountFieldId] },
        });
        const routing = assertServedByV2(response.headers, {
          operation: "GET /table/{tableId}/aggregation",
          feature: "getAggregation",
        });
        const aggregation = (response.data.aggregations ?? []).find(
          (item: { fieldId: string }) => item.fieldId === amountFieldId,
        ) as
          | {
              total?: { value?: unknown };
              group?: Record<string, { value?: unknown } | undefined>;
            }
          | undefined;

        const total = Number(aggregation?.total?.value ?? NaN);
        if (total !== expectedTotal) {
          throw new Error(
            `the total at the foot of the table is ${JSON.stringify(aggregation?.total ?? null)}, expected ` +
              `${expectedTotal} - this case is about the per-heading figures, and the foot total being wrong ` +
              "means something else is",
          );
        }

        const perHeading = headers.map((header) => ({
          id: header.id,
          value: aggregation?.group?.[header.id]?.value ?? null,
        }));
        const missing = perHeading.filter((entry) => entry.value == null);
        if (missing.length > 0) {
          throw new Error(
            `${missing.length} of ${headers.length} group headings came back with no total ` +
              `(${JSON.stringify(missing.map((entry) => entry.id))}), while the foot of the table says ${total} - ` +
              `the totals are keyed by ${Object.keys(aggregation?.group ?? {}).length} groups the list does not show, ` +
              "so the grid draws a blank where each group's number belongs",
          );
        }
        const seen = perHeading
          .map((entry) => Number(entry.value))
          .sort((left, right) => left - right);
        if (JSON.stringify(seen) !== JSON.stringify(expectedGroupSums)) {
          throw new Error(
            `the headings total ${JSON.stringify(seen)}, expected ${JSON.stringify(expectedGroupSums)} - ` +
              `the rows under one ${config.unit} heading are not all counted into it`,
          );
        }
        return { routing, total, perHeading };
      },
    );

    return {
      details: {
        tableId,
        unit: config.unit,
        timeZone: config.timeZone,
        rows: config.rows.length,
        expectedGroups,
        expectedGroupSums,
        total: probe.total,
        perHeading: probe.perHeading,
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
