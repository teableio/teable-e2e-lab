import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecord as apiGetRecord,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { GeneratedFormulaColumnCaseConfig } from "../types";

// A table carried over from an older version, where the formula column is one
// the database works out itself -> edit the cell the formula reads ->
// checkpoint: the edit saves.
//
// The product recalculates formula columns by writing the new value into them.
// On a table whose storage has the database doing that work instead, the write
// is refused - and the edit that triggered it is refused with it.
//
// So the row cannot be changed at all. Not the formula column - the ordinary
// column next to it, the one someone is trying to correct. The message is
// about a column the user did not touch.
//
// The storage is made with SQL: the product does not produce it any more, and
// nothing in the product shows which tables have it.

const NAME_FIELD = "Name";
const SOURCE_FIELD = "Quantity";
const FORMULA_FIELD = "Label";

export const runGeneratedFormulaColumnCase = async (
  bugCase: BugCaseFor<"generated-formula-column">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: GeneratedFormulaColumnCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.quantityBefore === config.quantityAfter) {
    throw new Error(
      "the edit has to change the cell, or a refused edit and an accepted one look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SOURCE_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.rowTitle,
            [SOURCE_FIELD]: config.quantityBefore,
          },
        },
      ],
    });
    tableId = table.id;
    const recordId = table.records[0]?.id;
    const sourceFieldId = table.fields.find(
      (field: { name: string }) => field.name === SOURCE_FIELD,
    )?.id;
    if (!recordId || !sourceFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const formulaField = await createField(tableId, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${sourceFieldId}} * 2` },
    });

    // Setup, outside the checkpoint: hand the formula column over to the
    // database, both in the product's own bookkeeping and physically. That is
    // the storage a table migrated from the previous version carries.
    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(tableId);
    const formulaColumn = await db.physicalColumn(formulaField.id);
    const sourceColumn = await db.physicalColumn(sourceFieldId);
    await db.execute(
      `UPDATE "field" SET "meta" = $1 WHERE "id" = $2`,
      JSON.stringify({ persistedAsGeneratedColumn: true }),
      formulaField.id,
    );
    await db.execute(
      `ALTER TABLE "${physical.schema}"."${physical.table}" DROP COLUMN "${formulaColumn}"`,
    );
    await db.execute(
      `ALTER TABLE "${physical.schema}"."${physical.table}" ` +
        `ADD COLUMN "${formulaColumn}" numeric GENERATED ALWAYS AS ("${sourceColumn}" * 2) STORED`,
    );

    const probe = await bugCheckpoint(
      "an-ordinary-cell-can-still-be-edited-on-a-table-carried-over",
      async () => {
        // A refused edit throws here, which is the report: the row cannot be
        // changed at all.
        const response = await apiUpdateRecord(tableId, recordId, {
          fieldKeyType: FieldKeyType.Id,
          record: { fields: { [sourceFieldId]: config.quantityAfter } },
        });
        const written = response.data.fields[sourceFieldId];
        if (written !== config.quantityAfter) {
          throw new Error(
            `the edited cell came back as ${JSON.stringify(written)}, expected ${config.quantityAfter}`,
          );
        }

        // And the row as it stands: the database's own value has to have
        // followed the edit, or the column is showing a stale number.
        const settled = await apiGetRecord(tableId, recordId, {
          fieldKeyType: FieldKeyType.Id,
        });
        // The column is numeric in the database and reads back as a string
        // through this path, so the comparison is on the number - measured on
        // develop in run 32684136417, where it came back as "14".
        const label = settled.data.fields[formulaField.id];
        if (
          label === null ||
          label === undefined ||
          Number(label) !== config.quantityAfter * 2
        ) {
          throw new Error(
            `after the edit the worked-out column holds ${JSON.stringify(label)}, expected ` +
              `${config.quantityAfter * 2}`,
          );
        }
        return { label };
      },
    );

    return {
      details: {
        tableId,
        recordId,
        formulaFieldId: formulaField.id,
        labelAfter: probe.label,
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
