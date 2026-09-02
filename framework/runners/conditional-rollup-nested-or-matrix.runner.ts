import { Colors, FieldKeyType, FieldType, RatingIcon } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

const NAME = "Name";
const MATCH_KEY = "MatchKey";
const VARIANT = "Variant";
const FLAG_A = "FlagA";
const FLAG_B = "FlagB";

const matrix = [
  {
    id: "Y471",
    variant: "single-line",
    source: "Text Value",
    rollup: "Text Count",
    expression: "countall({values})",
    expected: 1,
  },
  {
    id: "Y472",
    variant: "long-text",
    source: "Long Value",
    rollup: "Long Count",
    expression: "countall({values})",
    expected: 1,
  },
  {
    id: "Y478",
    variant: "rating",
    source: "Rating Value",
    rollup: "Rating Sum",
    expression: "sum({values})",
    expected: 2,
  },
  {
    id: "Y492",
    variant: "number",
    source: "Number Value",
    rollup: "Number Sum",
    expression: "sum({values})",
    expected: 60,
  },
] as const;

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));

export const runConditionalRollupNestedOrMatrixCase = async (
  bugCase: BugCaseFor<"conditional-rollup-nested-or-matrix">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];

  if (
    config.coveredCaseIds.join(",") !== matrix.map((item) => item.id).join(",")
  ) {
    throw new Error(
      "the case-id matrix no longer matches the implemented assertions",
    );
  }

  try {
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        { name: MATCH_KEY, type: FieldType.SingleLineText },
        { name: VARIANT, type: FieldType.SingleLineText },
        { name: FLAG_A, type: FieldType.SingleLineText },
        { name: FLAG_B, type: FieldType.LongText },
        { name: "Text Value", type: FieldType.SingleLineText },
        { name: "Long Value", type: FieldType.LongText },
        {
          name: "Rating Value",
          type: FieldType.Rating,
          options: {
            icon: RatingIcon.Star,
            color: Colors.YellowBright,
            max: 5,
          },
        },
        { name: "Number Value", type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME]: "text-match",
            [MATCH_KEY]: "A",
            [VARIANT]: "single-line",
            [FLAG_A]: "yes",
            [FLAG_B]: "yes",
            "Text Value": "included",
          },
        },
        {
          fields: {
            [NAME]: "text-excluded",
            [MATCH_KEY]: "A",
            [VARIANT]: "single-line",
            [FLAG_A]: "yes",
            [FLAG_B]: "no",
            "Text Value": "excluded",
          },
        },
        {
          fields: {
            [NAME]: "long-match",
            [MATCH_KEY]: "A",
            [VARIANT]: "long-text",
            [FLAG_A]: "no",
            [FLAG_B]: "no",
            "Long Value": "included long value",
          },
        },
        {
          fields: {
            [NAME]: "long-excluded",
            [MATCH_KEY]: "A",
            [VARIANT]: "long-text",
            [FLAG_A]: "yes",
            [FLAG_B]: "no",
            "Long Value": "excluded long value",
          },
        },
        {
          fields: {
            [NAME]: "rating-match",
            [MATCH_KEY]: "A",
            [VARIANT]: "rating",
            [FLAG_A]: "yes",
            [FLAG_B]: "yes",
            "Rating Value": 2,
          },
        },
        {
          fields: {
            [NAME]: "rating-excluded",
            [MATCH_KEY]: "A",
            [VARIANT]: "rating",
            [FLAG_A]: "yes",
            [FLAG_B]: "no",
            "Rating Value": 5,
          },
        },
        ...[
          ["number-a", "no", "no", 10],
          ["number-b", "yes", "yes", 20],
          ["number-c", "no", "yes", 30],
          ["number-excluded", "yes", "no", 40],
        ].map(([name, flagA, flagB, value]) => ({
          fields: {
            [NAME]: name,
            [MATCH_KEY]: "A",
            [VARIANT]: "number",
            [FLAG_A]: flagA,
            [FLAG_B]: flagB,
            "Number Value": value,
          },
        })),
        {
          fields: {
            [NAME]: "wrong-key",
            [MATCH_KEY]: "B",
            [VARIANT]: "number",
            [FLAG_A]: "no",
            [FLAG_B]: "yes",
            "Number Value": 1000,
          },
        },
      ],
    });
    tableIds.unshift(source.id);
    const sourceIds = Object.fromEntries(
      source.fields.map((field: { name: string; id: string }) => [
        field.name,
        field.id,
      ]),
    );

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        { name: MATCH_KEY, type: FieldType.SingleLineText },
      ],
      records: [
        { fields: { [NAME]: "Host A", [MATCH_KEY]: "A" } },
        { fields: { [NAME]: "Host Z", [MATCH_KEY]: "Z" } },
      ],
    });
    tableIds.unshift(host.id);
    const hostMatchKeyId = host.fields.find(
      (field: { name: string }) => field.name === MATCH_KEY,
    )?.id;
    if (
      !hostMatchKeyId ||
      !sourceIds[MATCH_KEY] ||
      !sourceIds[VARIANT] ||
      !sourceIds[FLAG_A] ||
      !sourceIds[FLAG_B]
    ) {
      throw new Error("the nested-filter fixture is incomplete");
    }

    for (const item of matrix) {
      await createField(host.id, {
        name: item.rollup,
        type: FieldType.ConditionalRollup,
        options: {
          foreignTableId: source.id,
          lookupFieldId: sourceIds[item.source],
          expression: item.expression,
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: sourceIds[MATCH_KEY],
                operator: "is",
                value: { type: "field", fieldId: hostMatchKeyId },
              },
              {
                fieldId: sourceIds[VARIANT],
                operator: "is",
                value: item.variant,
              },
              {
                conjunction: "or",
                filterSet: [
                  {
                    fieldId: sourceIds[FLAG_A],
                    operator: "is",
                    value: "no",
                  },
                  {
                    fieldId: sourceIds[FLAG_B],
                    operator: "is",
                    value: "yes",
                  },
                ],
              },
            ],
          },
        },
      });
    }

    const fixtureRead = await apiGetRecords(source.id, {
      fieldKeyType: FieldKeyType.Name,
      take: 50,
    });
    const routing = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (fixtureRead.data.records.length !== 11) {
      throw new Error(
        `the source fixture has ${fixtureRead.data.records.length} rows, expected 11`,
      );
    }

    const probe = await bugCheckpoint(
      "conditional-rollups-honor-the-nested-or-group",
      async () => {
        let byName = new Map<string, Record<string, unknown>>();
        const deadline = Date.now() + config.settleTimeoutMs;
        for (;;) {
          const read = await apiGetRecords(host.id, {
            fieldKeyType: FieldKeyType.Name,
            take: 5,
          });
          byName = new Map(
            read.data.records.map(
              (record: { fields: Record<string, unknown> }) => [
                String(record.fields[NAME]),
                record.fields,
              ],
            ),
          );
          const hostA = byName.get("Host A") ?? {};
          if (
            matrix.every(
              (item) => Number(hostA[item.rollup] ?? 0) === item.expected,
            )
          ) {
            break;
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `Host A reads ${JSON.stringify(hostA)}, expected ${JSON.stringify(
                Object.fromEntries(
                  matrix.map((item) => [item.rollup, item.expected]),
                ),
              )}`,
            );
          }
          await sleep(config.pollIntervalMs);
        }

        const hostZ = byName.get("Host Z") ?? {};
        const nonZero = matrix.filter(
          (item) => Number(hostZ[item.rollup] ?? 0) !== 0,
        );
        if (nonZero.length > 0) {
          throw new Error(
            `the unmatched host still summarized rows: ${JSON.stringify(hostZ)}`,
          );
        }
        return { hostA: byName.get("Host A"), hostZ };
      },
    );

    return {
      details: {
        sourceTableId: source.id,
        hostTableId: host.id,
        routing,
        hostA: probe.hostA,
        hostZ: probe.hostZ,
      },
    };
  } finally {
    for (const tableId of tableIds) {
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
    }
  }
};
