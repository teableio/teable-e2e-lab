import { FieldKeyType, FieldType, NumberFormattingType } from "@teable/core";
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
  NumericSwitchMatchingCaseConfig,
} from "../types";

// A number column shown with two decimals, one row per value -> a SWITCH on that
// number as a formula column -> checkpoint: each row takes the branch its
// number names.
//
// SWITCH compared the number with the branch values as display text, so a
// column formatted to two decimals read 1 as "1.00", matched no branch and fell
// through to the default for every row. A value that only rounds to a branch
// (1.004 shown as "1.00") must not take that branch, and a blank number falls
// through.

const LABEL_FIELD = "Label";
const NUMBER_FIELD = "n";

type Cell = number | string | null;

const sameCell = (actual: unknown, expected: Cell) =>
  expected === null
    ? actual === null || actual === undefined || actual === ""
    : typeof expected === "number"
      ? Number(actual) === expected && actual !== null && actual !== ""
      : actual === expected;

export const runNumericSwitchMatchingCase = async (
  bugCase: BugCaseFor<"numeric-switch-matching">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NumericSwitchMatchingCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const createdTableIds: string[] = [];

  for (const formula of config.formulas) {
    if (formula.expected.length !== config.rows.length) {
      throw new Error(
        `${formula.name} expects ${formula.expected.length} values for ${config.rows.length} rows`,
      );
    }
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: LABEL_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: NUMBER_FIELD,
          type: FieldType.Number,
          options: {
            formatting: {
              type: NumberFormattingType.Decimal,
              precision: config.precision,
            },
          },
        },
      ],
      records: config.rows.map((row) => ({
        fields: { [LABEL_FIELD]: row.label, [NUMBER_FIELD]: row.n },
      })),
    });
    createdTableIds.push(table.id);
    const labelId = table.fields.find(
      (field: { name: string }) => field.name === LABEL_FIELD,
    )?.id as string;
    const numberId = table.fields.find(
      (field: { name: string }) => field.name === NUMBER_FIELD,
    )?.id as string;
    const expressionOf = (template: string) =>
      template
        .replaceAll("{n}", `{${numberId}}`)
        .replaceAll("{a}", `{${labelId}}`);

    const formulaIds: string[] = [];
    for (const formula of config.formulas) {
      const made = await createField(table.id, {
        name: formula.name,
        type: FieldType.Formula,
        options: { expression: expressionOf(formula.expression) },
      });
      formulaIds.push(made.id);
    }

    const stored = await apiGetRecords(table.id, {
      fieldKeyType: FieldKeyType.Id,
      take: config.rows.length,
    });
    const routing = assertServedByV2(stored.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-number-takes-the-branch-it-names",
      async () => {
        const wrong: string[] = [];
        const byLabel = new Map(
          stored.data.records.map((record) => [
            String(record.fields[labelId]),
            record.fields,
          ]),
        );
        config.formulas.forEach((formula, index) => {
          config.rows.forEach((row, rowIndex) => {
            const actual = byLabel.get(row.label)?.[formulaIds[index]];
            const expected = formula.expected[rowIndex];
            if (!sameCell(actual, expected)) {
              wrong.push(
                `${formula.name} for n=${JSON.stringify(row.n)} reads ` +
                  `${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
              );
            }
          });
        });

        if (wrong.length > 0) {
          throw new Error(wrong.join("; "));
        }
        return { rows: stored.data.records.length };
      },
    );

    return { details: { tableId: table.id, routing, ...probe } };
  } finally {
    for (const tableId of createdTableIds) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
