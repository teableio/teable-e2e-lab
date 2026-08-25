import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { BlankNumberFormulaCaseConfig } from "../types";

// A worked-out number column that has nothing to say on some rows ->
// checkpoint: those rows are empty and the rest hold their number.
//
// "Show the amount only when it is over the threshold" is an ordinary column
// to write, and it is deliberately blank on most rows: that is what makes it
// readable at a glance. A number column with nothing in it is an everyday
// thing - a number column that has nothing in it *because a rule said so* is
// the same thing.
//
// It was not the same thing underneath. The rule produced an empty piece of
// text where a number was expected, which is not a number and not nothing, and
// the column could not be filled in at all - so the rows that did have a
// number lost it too, over a rule that was only ever about the other rows.
//
// Both halves are read: the rows the rule keeps and the rows it blanks. A
// column that came back entirely empty would satisfy half of this and is
// exactly what a broken column looks like.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const SHOWN_FIELD = "Large amounts";

export const runBlankNumberFormulaCase = async (
  bugCase: BugCaseFor<"blank-number-formula">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: BlankNumberFormulaCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const kept = config.amounts.filter((amount) => amount > config.threshold);
  const blanked = config.amounts.filter((amount) => amount <= config.threshold);
  if (kept.length === 0 || blanked.length === 0) {
    throw new Error(
      `the fixture needs amounts on both sides of ${config.threshold} - got ${JSON.stringify(config.amounts)}, ` +
        "or a column that is entirely empty and a correct one would look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.amounts.map((amount, index) => ({
        fields: { [NAME_FIELD]: `row-${index}`, [AMOUNT_FIELD]: amount },
      })),
    });
    tableId = table.id;
    const amountFieldId = table.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    if (!amountFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the amounts are stored as
    // written. A column that is blank because its source is blank would say
    // nothing about a rule that blanks it.
    const seeded = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      take: config.amounts.length,
    });
    const storedAmounts = seeded.data.records
      .map((record: { fields: Record<string, unknown> }) =>
        Number(record.fields[amountFieldId]),
      )
      .sort((left, right) => left - right);
    if (
      storedAmounts.join(",") !==
      [...config.amounts].sort((left, right) => left - right).join(",")
    ) {
      throw new Error(
        `the amounts read back as ${JSON.stringify(storedAmounts)}, expected ${JSON.stringify(config.amounts)}`,
      );
    }

    const probe = await bugCheckpoint(
      "a-worked-out-number-column-may-be-blank-on-some-rows",
      async () => {
        // The rule a person writes: show the amount when it is over the
        // threshold, and nothing otherwise.
        const shown = await createField(tableId, {
          name: SHOWN_FIELD,
          type: FieldType.Formula,
          options: {
            expression: `IF({${amountFieldId}} > ${config.threshold}, {${amountFieldId}}, BLANK())`,
          },
        });

        let values: (number | null)[] = [];
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          const read = await apiGetRecords(tableId, {
            fieldKeyType: FieldKeyType.Id,
            take: config.amounts.length,
          });
          values = read.data.records.map(
            (record: { fields: Record<string, unknown> }) => {
              const cell = record.fields[shown.id];
              return cell == null ? null : Number(cell);
            },
          );
          if (values.some((value) => value != null)) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }

        const heldNumbers = values
          .filter((value): value is number => value != null)
          .sort((left, right) => left - right);
        const expectedKept = [...kept].sort((left, right) => left - right);
        if (heldNumbers.join(",") !== expectedKept.join(",")) {
          throw new Error(
            `the column holds ${JSON.stringify(heldNumbers)}, expected ${JSON.stringify(expectedKept)} - ` +
              (heldNumbers.length === 0
                ? "the rows the rule keeps lost their number too, over a rule that was only ever about the other rows"
                : "the rule kept the wrong rows"),
          );
        }
        const blankCount = values.filter((value) => value == null).length;
        if (blankCount !== blanked.length) {
          throw new Error(
            `${blankCount} rows came back empty, expected ${blanked.length}`,
          );
        }
        return { values };
      },
    );

    return {
      details: {
        tableId,
        threshold: config.threshold,
        amounts: config.amounts,
        columnValues: probe.values,
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
