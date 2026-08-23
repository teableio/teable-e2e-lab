import { FieldType, StatisticsFunc } from "@teable/core";
import { getAggregation as apiGetAggregation } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AggregationMixedCaseCaseConfig } from "../types";

// A column whose name has capital letters -> ask for its total -> checkpoint:
// the number comes back.
//
// Postgres folds an unquoted identifier to lower case, so a column stored as
// "TotalAmount" is only findable if the query quotes it. The aggregation query
// did not, and asking a table for the sum of such a column failed - which is
// the number a grid shows under the column, and what every summary row and
// group total is made of.
//
// Column names follow field names, and a field named the way people name
// things - Total Amount, Due Date, Owner Email - has capitals. So this is not
// an exotic table; it is most of them.

const NAME_FIELD = "Name";

export const runAggregationMixedCaseCase = async (
  bugCase: BugCaseFor<"aggregation-mixed-case">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AggregationMixedCaseCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.fieldName === config.fieldName.toLowerCase()) {
    throw new Error(
      `"${config.fieldName}" has no capital letters - an unquoted identifier folds to itself and the ` +
        "query would find it either way",
    );
  }
  const expectedTotal = config.amounts.reduce((sum, value) => sum + value, 0);

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: config.fieldName, type: FieldType.Number },
      ],
      records: config.amounts.map((amount, index) => ({
        fields: { [NAME_FIELD]: `row-${index}`, [config.fieldName]: amount },
      })),
    });
    tableId = table.id;
    const amountField = table.fields.find(
      (field: { name: string }) => field.name === config.fieldName,
    );
    if (!amountField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the physical column really
    // carries capitals. Field names and column names are related but not the
    // same string, and a build that lower-cased the column on creation would
    // make this case about nothing.
    const db = fixtureDb(context.app);
    const column = await db.physicalColumn(amountField.id);
    if (column === column.toLowerCase()) {
      throw new Error(
        `the physical column is "${column}", which has no capitals - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-capitalised-column-can-be-totalled",
      async () => {
        const response = await apiGetAggregation(tableId, {
          field: { [StatisticsFunc.Sum]: [amountField.id] },
        });
        const entry = (response.data.aggregations ?? []).find(
          (item: { fieldId: string }) => item.fieldId === amountField.id,
        );
        const value = Number(entry?.total?.value ?? NaN);
        if (!Number.isFinite(value) || value !== expectedTotal) {
          throw new Error(
            `the total came back as ${JSON.stringify(entry?.total ?? null)}, expected ${expectedTotal}`,
          );
        }
        return { column, value };
      },
    );

    return {
      details: {
        tableId,
        fieldName: config.fieldName,
        physicalColumn: probe.column,
        total: probe.value,
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
