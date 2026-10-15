import {
  Colors,
  FieldKeyType,
  FieldType,
  NumberFormattingType,
  SingleNumberDisplayType,
} from "@teable/core";
import {
  createField,
  createTable,
  getField,
  getRecord,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  FormulaPatchExpressionCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A numeric formula with a number format, a ring display and a time zone ->
// PATCH only its expression, to one that produces text -> checkpoint: the
// formula now produces text, the number format and ring are gone, the time
// zone is kept, and the row shows the new result.
//
// PATCH is the partial edit an integration sends: "change the expression,
// leave the rest". It answered 200 and changed nothing - the column went on
// computing the old expression - so a script that edits formulas reported
// success on every one of them.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const FORMULA_FIELD = "Doubled";

export const runFormulaPatchExpressionCase = async (
  bugCase: BugCaseFor<"formula-patch-expression">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormulaPatchExpressionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.rowTitle,
            [AMOUNT_FIELD]: config.amount,
          },
        },
      ],
    });
    tableIds.push(table.id);
    const amountId = table.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    if (!amountId) {
      throw new Error(`table ${table.id} has no ${AMOUNT_FIELD} column`);
    }
    const formula = await createField(table.id, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `{${amountId}} * 2`,
        timeZone: config.timeZone,
        formatting: { type: NumberFormattingType.Decimal, precision: 0 },
        showAs: {
          type: SingleNumberDisplayType.Ring,
          color: Colors.Blue,
          showValue: true,
          maxValue: 100,
        },
      },
    });
    const recordId = table.records[0].id;
    const before = await getRecord(table.id, recordId);
    if (before.fields[formula.id] !== config.amount * 2) {
      throw new Error(
        `the formula reads ${JSON.stringify(before.fields[formula.id])} before the edit, expected ${config.amount * 2}`,
      );
    }

    const expression = `"${config.prefix}"&{${amountId}}`;
    const expectedValue = `${config.prefix}${config.amount}`;

    const probe = await bugCheckpoint(
      "patching-a-formula-expression-changes-what-it-computes",
      async () => {
        const patched = await rawRequest(
          "PATCH",
          `/table/${table.id}/field/${formula.id}`,
          { options: { expression } },
        );
        if (!isSuccess(patched)) {
          throw new Error(
            `patching the expression answered ${describeResponse(patched)}`,
          );
        }
        const routing = assertServedByV2(patched.headers, {
          operation: "PATCH /table/{tableId}/field/{fieldId}",
          feature: "updateField",
        });
        const field = await getField(table.id, formula.id);
        const options = (field.options ?? {}) as Record<string, unknown>;
        const value = (await getRecord(table.id, recordId)).fields[formula.id];
        const problems: string[] = [];
        if (options.expression !== expression) {
          problems.push(
            `the expression is still ${JSON.stringify(options.expression)}`,
          );
        }
        if (field.cellValueType !== "string") {
          problems.push(`cellValueType is ${String(field.cellValueType)}`);
        }
        if (options.timeZone !== config.timeZone) {
          problems.push(
            `the time zone became ${JSON.stringify(options.timeZone)}`,
          );
        }
        if ("formatting" in options || "showAs" in options) {
          problems.push(
            `number display options survived: ${JSON.stringify({ formatting: options.formatting, showAs: options.showAs })}`,
          );
        }
        if (value !== expectedValue) {
          problems.push(
            `the row reads ${JSON.stringify(value)}, expected ${JSON.stringify(expectedValue)}`,
          );
        }
        if (problems.length > 0) {
          throw new Error(
            `the PATCH answered ${patched.status} but ${problems.join("; ")}`,
          );
        }
        return { routing, options, value };
      },
    );

    return {
      details: {
        tableId: table.id,
        options: probe.options,
        value: probe.value,
      },
    };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
