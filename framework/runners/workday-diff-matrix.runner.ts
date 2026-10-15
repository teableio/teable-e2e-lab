import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
} from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  WorkdayDiffMatrixCaseConfig,
} from "../types";
import { dropTables } from "./raw-api";

// Pairs of dates covering both ends on a weekday, both ends on a weekend, a
// single day, and a reversed range -> a WORKDAY_DIFF formula over each pair ->
// checkpoint: every row holds the count of working days with both ends
// included, and a reversed range holds the same count negated.
//
// Counting working days between two dates is how deadlines and SLAs are
// measured. The count left out one end, so every span came out a day short -
// a one-week task read four days - and the obvious repair of adding one back
// broke the reversed ranges and the weekend-only ones, which have to stay
// negative and zero. The pairs are chosen so that each of those shapes has a
// row of its own.

const NAME_FIELD = "Name";
const START_FIELD = "Start";
const END_FIELD = "End";
const DIFF_FIELD = "Working days";

const DAY_MS = 86_400_000;

// Working days from start to end, both ends included, weekends skipped; a
// reversed range counts the same days and negates.
export const workdaysBetween = (start: string, end: string) => {
  const from = Date.parse(`${start}T00:00:00.000Z`);
  const to = Date.parse(`${end}T00:00:00.000Z`);
  const [low, high] = from <= to ? [from, to] : [to, from];
  let count = 0;
  for (let day = low; day <= high; day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      count++;
    }
  }
  return from <= to ? count : -count;
};

export const runWorkdayDiffMatrixCase = async (
  bugCase: BugCaseFor<"workday-diff-matrix">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: WorkdayDiffMatrixCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  const expected = config.pairs.map(([start, end]) =>
    workdaysBetween(start, end),
  );
  if (!expected.some((value) => value < 0) || !expected.includes(0)) {
    throw new Error(
      "the pairs need a reversed range and a weekend-only range, or adding one to every count passes too",
    );
  }

  try {
    const dateColumn = (name: string) => ({
      name,
      type: FieldType.Date,
      options: {
        formatting: {
          date: DateFormattingPreset.ISO,
          time: TimeFormatting.None,
          timeZone: "UTC",
        },
      },
    });
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        dateColumn(START_FIELD),
        dateColumn(END_FIELD),
      ],
      records: config.pairs.map(([start, end]) => ({
        fields: {
          [NAME_FIELD]: `${start}..${end}`,
          [START_FIELD]: `${start}T00:00:00.000Z`,
          [END_FIELD]: `${end}T00:00:00.000Z`,
        },
      })),
    });
    tableIds.push(table.id);
    const fieldId = (name: string) =>
      table.fields.find((field: { name: string }) => field.name === name)?.id;
    const startId = fieldId(START_FIELD);
    const endId = fieldId(END_FIELD);
    if (!startId || !endId) {
      throw new Error(`table ${table.id} is not in place`);
    }
    await createField(table.id, {
      name: DIFF_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `WORKDAY_DIFF({${startId}}, {${endId}})`,
        timeZone: config.timeZone,
      },
    });

    const probe = await bugCheckpoint(
      "working-days-count-both-ends",
      async () => {
        const read = await apiGetRecords(table.id, {
          fieldKeyType: FieldKeyType.Name,
          take: config.pairs.length,
        });
        const routing = assertServedByV2(read.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const byName = new Map<string, unknown>(
          read.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD]),
              record.fields[DIFF_FIELD],
            ],
          ),
        );
        const wrong = config.pairs
          .map(([start, end], index) => ({
            range: `${start}..${end}`,
            expected: expected[index],
            actual: byName.get(`${start}..${end}`),
          }))
          .filter(({ expected: want, actual }) => Number(actual) !== want);
        if (wrong.length > 0) {
          throw new Error(
            `${wrong.length} of ${config.pairs.length} ranges count wrong: ${wrong
              .map(
                ({ range, expected: want, actual }) =>
                  `${range} reads ${JSON.stringify(actual)}, expected ${want}`,
              )
              .join("; ")}`,
          );
        }
        return { routing };
      },
    );

    return { details: { tableId: table.id, expected, routing: probe.routing } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
