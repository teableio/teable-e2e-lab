import { FieldKeyType, FieldType } from "@teable/core";
import {
  getFields as apiGetFields,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  convertField,
  createField,
  createTable,
  deleteField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormulaErrorRepairCaseConfig } from "../types";

// A formula whose column was deleted out from under it -> point the formula at
// another column -> checkpoint: the error is gone and the values are the new
// ones.
//
// Deleting a column that a formula reads leaves the formula marked broken,
// which is right. Repointing it at another column is the repair, and the
// repair was accepted without the mark being cleared: the column keeps its
// warning and its old values, and there is nothing further the user can do to
// it - the thing that was supposed to fix it has already been done.
//
// Two people looking at that column disagree about whether the base is
// healthy: the person who repaired it knows it is fine, everyone else sees a
// column flagged as broken, and the numbers under the flag are the ones from
// before.
//
// The values are the second half of the assertion. A build that cleared the
// warning and left the old values behind would look repaired and be wrong.

const NAME_FIELD = "Name";
const SOURCE_FIELD = "Source";
const FALLBACK_FIELD = "Fallback";
const FORMULA_FIELD = "Derived";

export const runFormulaErrorRepairCase = async (
  bugCase: BugCaseFor<"formula-error-repair">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormulaErrorRepairCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const expected = config.fallbackValue.toLowerCase();
  if (expected === config.sourceValue.toLowerCase()) {
    throw new Error(
      "the two columns have to hold different text, or a formula still reading the deleted column and one " +
        "reading the new column produce the same answer",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SOURCE_FIELD, type: FieldType.SingleLineText },
        { name: FALLBACK_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.rowTitle,
            [SOURCE_FIELD]: config.sourceValue,
            [FALLBACK_FIELD]: config.fallbackValue,
          },
        },
      ],
    });
    tableId = table.id;
    const fieldId = (name: string) =>
      table.fields.find((field: { name: string }) => field.name === name)?.id;
    const sourceFieldId = fieldId(SOURCE_FIELD);
    const fallbackFieldId = fieldId(FALLBACK_FIELD);
    if (!sourceFieldId || !fallbackFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const formulaField = await createField(tableId, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `LOWER({${sourceFieldId}})` },
    });

    // Take the column the formula reads away. This is the state the repair is
    // for, and the error mark it leaves is correct.
    await deleteField(tableId, sourceFieldId);

    // Fixture verification, outside the checkpoint: the formula really is
    // marked broken now. Clearing a mark that was never set would pass
    // anywhere.
    const broken = await apiGetFields(tableId, {
      fieldKeyType: FieldKeyType.Id,
    });
    const brokenField = broken.data.find(
      (field: { id: string }) => field.id === formulaField.id,
    ) as { hasError?: boolean } | undefined;
    if (!brokenField?.hasError) {
      throw new Error(
        `after deleting ${SOURCE_FIELD} the formula is not marked broken - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "repairing-a-formula-clears-its-error",
      async () => {
        // The repair: read another column instead.
        await convertField(tableId, formulaField.id, {
          name: FORMULA_FIELD,
          type: FieldType.Formula,
          options: { expression: `LOWER({${fallbackFieldId}})` },
        });

        const after = await apiGetFields(tableId, {
          fieldKeyType: FieldKeyType.Id,
        });
        const repaired = after.data.find(
          (field: { id: string }) => field.id === formulaField.id,
        ) as { hasError?: boolean } | undefined;
        if (repaired?.hasError) {
          throw new Error(
            "the formula was repaired but the column is still marked broken - there is nothing further the " +
              "user can do to it",
          );
        }

        // And the values, which is what the warning was about.
        const records = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 1,
        });
        const value = records.data.records[0]?.fields[FORMULA_FIELD] ?? null;
        if (value !== expected) {
          throw new Error(
            `the warning is gone but the column holds ${JSON.stringify(value)}, expected ` +
              `${JSON.stringify(expected)} - it looks repaired and is not`,
          );
        }
        return { value };
      },
    );

    return {
      details: {
        tableId,
        formulaFieldId: formulaField.id,
        valueAfterRepair: probe.value,
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
