import { FieldKeyType, FieldType } from "@teable/core";
import {
  convertField as apiConvertField,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NumberToTextFormulaCaseConfig } from "../types";

// A column of numbers -> turn it into a worked-out reference code ->
// checkpoint: every row holds its code.
//
// This is how a plain counter becomes a reference someone can quote on the
// phone: the case numbers were 1, 2, 3, and now they should read C-001,
// C-002, C-003. The column keeps its place and its meaning; only the way it is
// written changes.
//
// The change did not go through. The column's storage was made for numbers and
// the new rule produces text, and the pass that fills the column in failed
// where nobody could see it - so the column sat empty, or half filled, with
// nothing on screen explaining why and no way to finish the job.
//
// The case waits for the codes rather than reading once: filling a column in
// happens after the request answers, and a case that read immediately would
// call slow "empty".

const CASE_FIELD = "Case number";

export const runNumberToTextFormulaCase = async (
  bugCase: BugCaseFor<"number-to-text-formula">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NumberToTextFormulaCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.numbers.length < 2) {
    throw new Error(
      "two rows at least - with one, a column that filled in and a column that filled one row look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [{ name: CASE_FIELD, type: FieldType.Number, isPrimary: true }],
      records: config.numbers.map((value) => ({
        fields: { [CASE_FIELD]: value },
      })),
    });
    tableId = table.id;
    const caseFieldId = table.fields[0]?.id;
    if (!caseFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readColumn = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: config.numbers.length,
      });
      return read.data.records.map(
        (record: { fields: Record<string, unknown> }) =>
          record.fields[caseFieldId] ?? null,
      );
    };

    // Fixture verification, outside the checkpoint: the numbers are in the
    // column as written. A column that was already empty could not show a
    // conversion that failed to fill it.
    const before = await readColumn();
    const storedNumbers = before
      .map((value) => Number(value))
      .sort((a, b) => a - b);
    if (
      storedNumbers.join(",") !==
      [...config.numbers].sort((a, b) => a - b).join(",")
    ) {
      throw new Error(
        `the column holds ${JSON.stringify(before)}, expected ${JSON.stringify(config.numbers)}`,
      );
    }

    const probe = await bugCheckpoint(
      "a-number-column-becomes-a-worked-out-reference-code",
      async () => {
        // A refused conversion throws here, and a conversion that answers and
        // leaves the column empty is caught by the wait below.
        await apiConvertField(tableId, caseFieldId, {
          name: CASE_FIELD,
          type: FieldType.Formula,
          options: { expression: config.expression },
        });

        let values: (string | null)[] = [];
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          values = (await readColumn()).map((value) =>
            value == null ? null : String(value),
          );
          if (values.every((value) => value != null && value.length > 0)) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }

        const pattern = new RegExp(config.expectedPattern);
        const wrong = values.filter(
          (value) => value == null || !pattern.test(value),
        );
        if (wrong.length > 0) {
          throw new Error(
            `${wrong.length} of ${values.length} rows do not read as a reference code: ${JSON.stringify(values)} - ` +
              "the column's storage was made for numbers and the new rule writes text, so the pass that fills it in never finished",
          );
        }
        if (new Set(values).size !== values.length) {
          throw new Error(
            `the rows read ${JSON.stringify(values)} - every row should have its own code`,
          );
        }
        return { values };
      },
    );

    return {
      details: {
        tableId,
        expression: config.expression,
        codes: probe.values,
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
