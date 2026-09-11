import { FieldKeyType, FieldType } from "@teable/core";
import {
  getFields as apiGetFields,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormulaBranchErrorBackfillCaseConfig } from "../types";

// A worked-out column whose formula chooses between branches, where the branch
// NOT taken cannot be worked out for that row -> add the column to a table that
// already has rows -> checkpoint: every row reads the branch that was taken.
//
// "If there is no baseline, say so, otherwise say how far off we are" is an
// ordinary thing to write, and the rows with no baseline are exactly the ones
// the first branch is there for. Working out the second branch for those rows
// divides by zero - which is why nobody asked for it.
//
// Both branches were worked out anyway and the error from the unused one was
// applied to the answer, so the column came back empty for those rows - or the
// whole fill-in for the existing rows failed and the column stayed blank for
// everybody. The formula is accepted, nothing is flagged, and the column is
// simply not there.
//
// Adding the column to a table that already holds rows is the trigger: this is
// the fill-in of existing rows, not the working out of a new one, and those are
// different paths.

const NAME_FIELD = "Name";
const QTY_FIELD = "Qty";
const UNIT_COST_FIELD = "Unit Cost";
const BASELINE_FIELD = "Baseline Unit Cost";
const AMOUNT_FIELD = "Amount";
const BASELINE_TOTAL_FIELD = "Baseline Total";
const VARIANCE_FIELD = "Variance Rate";
const ANSWER_FIELD = "Price Alert";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

// What each row should read, derived locally from the same numbers the fixture
// writes - the formulas below in JavaScript.
const expectedNestedAlert = (row: {
  qty?: number;
  unitCost?: number;
  baselineUnitCost?: number;
}) => {
  const baselineTotal =
    row.qty === undefined ? null : row.qty * (row.baselineUnitCost ?? 0);
  if (baselineTotal === null || baselineTotal <= 0) {
    return "no baseline";
  }
  const rate = (row.qty! * (row.unitCost ?? 0) - baselineTotal) / baselineTotal;
  if (rate > 0.05) {
    return "up";
  }
  return rate > 0 ? "high" : "ok";
};

export const runFormulaBranchErrorBackfillCase = async (
  bugCase: BugCaseFor<"formula-branch-error-backfill">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormulaBranchErrorBackfillCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.shape === "nested-alert") {
    const withoutBaseline = config.rows.filter(
      (row) =>
        row.qty === undefined || row.qty * (row.baselineUnitCost ?? 0) <= 0,
    );
    if (withoutBaseline.length === 0) {
      throw new Error(
        "no row here has a baseline of zero - the branch that divides by it is never the unused one, and the " +
          "case could not tell the two branches apart",
      );
    }
    if (withoutBaseline.length === config.rows.length) {
      throw new Error(
        "every row takes the first branch - a column that answered the first branch for everything would look correct",
      );
    }
  } else {
    const positive = config.rows.filter((row) => (row.amount ?? 0) > 0);
    if (positive.length === 0 || positive.length === config.rows.length) {
      throw new Error(
        "the rows have to straddle zero - both branches have to be taken by something, or one answer fits every row",
      );
    }
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields:
        config.shape === "nested-alert"
          ? [
              {
                name: NAME_FIELD,
                type: FieldType.SingleLineText,
                isPrimary: true,
              },
              { name: QTY_FIELD, type: FieldType.Number },
              { name: UNIT_COST_FIELD, type: FieldType.Number },
              { name: BASELINE_FIELD, type: FieldType.Number },
            ]
          : [
              {
                name: NAME_FIELD,
                type: FieldType.SingleLineText,
                isPrimary: true,
              },
              { name: AMOUNT_FIELD, type: FieldType.Number },
            ],
      records: config.rows.map((row) => ({
        fields:
          config.shape === "nested-alert"
            ? {
                [NAME_FIELD]: row.name,
                ...(row.qty === undefined ? {} : { [QTY_FIELD]: row.qty }),
                [UNIT_COST_FIELD]: row.unitCost ?? 0,
                [BASELINE_FIELD]: row.baselineUnitCost ?? 0,
              }
            : {
                [NAME_FIELD]: row.name,
                ...(row.amount === undefined
                  ? {}
                  : { [AMOUNT_FIELD]: row.amount }),
              },
      })),
    });
    tableId = table.id;
    const fieldId = (name: string) =>
      table.fields.find((field: { name: string }) => field.name === name)?.id;

    // Fixture verification, outside the checkpoint: the rows are in place with
    // the numbers the expectations are derived from.
    const seeded = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rows.length,
    });
    assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (seeded.data.records.length !== config.rows.length) {
      throw new Error(
        `${seeded.data.records.length} of ${config.rows.length} rows landed - the fixture is not in place`,
      );
    }

    // The intermediate worked-out columns, which is what makes the branch that
    // is not taken unworkable rather than merely unused: the rate divides by a
    // total that is zero on those rows.
    let expressionFieldIds: Record<string, string> = {};
    if (config.shape === "nested-alert") {
      const qtyId = fieldId(QTY_FIELD);
      const unitCostId = fieldId(UNIT_COST_FIELD);
      const baselineId = fieldId(BASELINE_FIELD);
      if (!qtyId || !unitCostId || !baselineId) {
        throw new Error(`Table ${tableId} is not in place`);
      }
      const baselineTotal = await createField(tableId, {
        name: BASELINE_TOTAL_FIELD,
        type: FieldType.Formula,
        options: { expression: `{${qtyId}} * {${baselineId}}` },
      });
      const variance = await createField(tableId, {
        name: VARIANCE_FIELD,
        type: FieldType.Formula,
        options: {
          expression:
            `IF({${baselineTotal.id}}>0,({${qtyId}}*{${unitCostId}}-{${baselineTotal.id}})` +
            `/{${baselineTotal.id}},BLANK())`,
        },
      });
      expressionFieldIds = {
        baselineTotal: baselineTotal.id,
        variance: variance.id,
      };
    }

    const probe = await bugCheckpoint(
      "a-worked-out-column-answers-the-branch-it-took",
      async () => {
        const expression =
          config.shape === "nested-alert"
            ? `IF({${expressionFieldIds.baselineTotal}}<=0,"no baseline",` +
              `IF({${expressionFieldIds.variance}}>0.05,"up",` +
              `IF({${expressionFieldIds.variance}}>0,"high","ok")))`
            : `IF({${fieldId(AMOUNT_FIELD)}}<=0,"",{${fieldId(AMOUNT_FIELD)}})`;
        const answer = await createField(tableId, {
          name: ANSWER_FIELD,
          type: FieldType.Formula,
          options: { expression },
        });

        const expectedByName = new Map<string, string | number | null>(
          config.rows.map((row) => [
            row.name,
            config.shape === "nested-alert"
              ? expectedNestedAlert(row)
              : (row.amount ?? 0) > 0
                ? (row.amount as number)
                : null,
          ]),
        );

        const read = async () => {
          const rows = await apiGetRecords(tableId, {
            fieldKeyType: FieldKeyType.Id,
            take: config.rows.length,
          });
          return rows.data.records.map(
            (record: { fields: Record<string, unknown> }) => ({
              name: String(record.fields[fieldId(NAME_FIELD)!] ?? ""),
              value: record.fields[answer.id] ?? null,
            }),
          );
        };
        const matches = (seen: { name: string; value: unknown }[]) =>
          seen.every((row) => {
            const expected = expectedByName.get(row.name);
            if (expected === null) {
              return row.value === null || row.value === "";
            }
            return typeof expected === "number"
              ? Number(row.value) === expected
              : row.value === expected;
          });

        // Filling in the existing rows is not always finished by the time the
        // column is created, so the answer is polled rather than read once.
        const deadline = Date.now() + config.settleTimeoutMs;
        let seen = await read();
        while (!matches(seen) && Date.now() < deadline) {
          await sleep(config.pollIntervalMs);
          seen = await read();
        }

        const described = (await apiGetFields(tableId)).data.find(
          (field: { id: string }) => field.id === answer.id,
        ) as { hasError?: boolean; cellValueType?: string } | undefined;

        if (!matches(seen)) {
          const wrong = seen.filter((row) => {
            const expected = expectedByName.get(row.name);
            return expected === null
              ? !(row.value === null || row.value === "")
              : typeof expected === "number"
                ? Number(row.value) !== expected
                : row.value !== expected;
          });
          throw new Error(
            `after ${config.settleTimeoutMs}ms ${wrong.length} of ${seen.length} rows read the wrong answer: ` +
              `${JSON.stringify(
                wrong.map((row) => ({
                  row: row.name,
                  reads: row.value,
                  expected: expectedByName.get(row.name) ?? null,
                })),
              )} - the column is flagged as ${JSON.stringify(described?.hasError ?? null)}, so nothing tells the ` +
              "person that the branch they asked for was not the one that decided the answer",
          );
        }
        if (described?.hasError) {
          throw new Error(
            "the column reads correctly and is flagged as broken - whoever opens the table sees a warning on a " +
              "column whose values are right",
          );
        }
        return { seen, cellValueType: described?.cellValueType ?? null };
      },
    );

    return {
      details: {
        tableId,
        shape: config.shape,
        rows: config.rows.length,
        cellValueType: probe.cellValueType,
        answers: probe.seen,
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
