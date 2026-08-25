import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { QuotedColumnNameFormulaCaseConfig } from "../types";

// A column whose name contains a quotation mark -> a worked-out column over
// it, and a second worked-out column over that -> checkpoint: both compute.
//
// A column name is a label a person writes, so it contains whatever they type:
// a size in inches, a quoted phrase, the name of a product with a quote in it.
// Nothing about the interface suggests some characters are unavailable.
//
// The name is carried into the database as an identifier, and an identifier
// with a quotation mark in it has to be escaped or it ends the identifier
// early. Unescaped, the query that fills the worked-out columns in is not the
// query anybody meant.
//
// Two worked-out columns rather than one, because the reference is written in
// two places: a column reading the table directly, and a column reading
// another worked-out column. One of them alone would leave half the escaping
// unexercised.

const QUOTED_FIELD_BASE = "Length";
const FIRST_COMPUTED = "Letters";
const SECOND_COMPUTED = "Letters plus one";

export const runQuotedColumnNameFormulaCase = async (
  bugCase: BugCaseFor<"quoted-column-name-formula">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: QuotedColumnNameFormulaCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (!config.quotedColumnName.includes('"')) {
    throw new Error(
      `the column name ${JSON.stringify(config.quotedColumnName)} has no quotation mark in it, so nothing needs escaping and the case has nothing to ask`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
        { name: config.quotedColumnName, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            Name: "the-row",
            [config.quotedColumnName]: config.value,
          },
        },
      ],
    });
    tableId = table.id;
    const quotedFieldId = table.fields.find(
      (field: { name: string }) => field.name === config.quotedColumnName,
    )?.id;
    const rowId = table.records?.[0]?.id;
    if (!quotedFieldId || !rowId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the column kept the name
    // that has the quotation mark in it, and the row carries the value. A
    // product that silently renamed the column would leave nothing to escape.
    const seeded = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const seededValue = seeded.data.records.find(
      (record: { id: string }) => record.id === rowId,
    )?.fields[quotedFieldId];
    if (seededValue !== config.value) {
      throw new Error(
        `the column named ${JSON.stringify(config.quotedColumnName)} holds ${JSON.stringify(seededValue)}, expected ${JSON.stringify(config.value)}`,
      );
    }

    const probe = await bugCheckpoint(
      "columns-worked-out-over-a-quoted-column-name-compute",
      async () => {
        // Reading the table directly.
        const first = await createField(tableId, {
          name: FIRST_COMPUTED,
          type: FieldType.Formula,
          options: { expression: `LEN({${quotedFieldId}})` },
        });
        // Reading the column above rather than the table.
        const second = await createField(tableId, {
          name: SECOND_COMPUTED,
          type: FieldType.Formula,
          options: { expression: `{${first.id}} + 1` },
        });

        const expectedFirst = config.value.length;
        let firstValue: unknown;
        let secondValue: unknown;
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          const read = await apiGetRecords(tableId, {
            fieldKeyType: FieldKeyType.Id,
            take: 5,
          });
          const row = read.data.records.find(
            (record: { id: string }) => record.id === rowId,
          );
          firstValue = row?.fields[first.id];
          secondValue = row?.fields[second.id];
          if (firstValue != null && secondValue != null) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }
        if (Number(firstValue) !== expectedFirst) {
          throw new Error(
            `the column counting the letters of ${JSON.stringify(config.quotedColumnName)} reads ${JSON.stringify(firstValue)}, expected ${expectedFirst}`,
          );
        }
        if (Number(secondValue) !== expectedFirst + 1) {
          throw new Error(
            `the column reading that one reads ${JSON.stringify(secondValue)}, expected ${expectedFirst + 1}`,
          );
        }
        return { firstValue, secondValue };
      },
    );

    return {
      details: {
        tableId,
        quotedColumnName: config.quotedColumnName,
        firstComputed: probe.firstValue,
        secondComputed: probe.secondValue,
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
