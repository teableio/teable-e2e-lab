import {
  Colors,
  FieldType,
  NumberFormattingType,
  Relationship,
  SingleNumberDisplayType,
} from "@teable/core";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ComputedTypeChangeResetCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// Products with a number column, orders rolling up its largest value with a
// number format and a ring display -> convert the number column to a date ->
// checkpoint: the conversion succeeds, and the rollup now holds a date with
// date formatting and no ring.
//
// Changing a column's type is ordinary tidying - a column of numbers that was
// meant to hold dates. Everything computed from it has to follow: a largest
// value of dates is a date. The conversion failed outright instead, with a
// database error about reading a date as a number, because the rollup was
// recomputed while still declaring itself numeric. The source column stayed a
// number and the user had no way to make the change at all.

const NAME_FIELD = "Name";
const VALUE_FIELD = "Value";
const LINK_FIELD = "Products";
const ROLLUP_FIELD = "Largest";

export const runComputedTypeChangeResetCase = async (
  bugCase: BugCaseFor<"computed-type-change-reset">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ComputedTypeChangeResetCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const products = await createTable(baseId, {
      name: `${config.tableNamePrefix}-products-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: VALUE_FIELD,
          type: FieldType.Number,
          options: {
            formatting: { type: NumberFormattingType.Decimal, precision: 0 },
          },
        },
      ],
      records: config.values.map((value, index) => ({
        fields: { [NAME_FIELD]: `product-${index + 1}`, [VALUE_FIELD]: value },
      })),
    });
    tableIds.push(products.id);
    const orders = await createTable(baseId, {
      name: `${config.tableNamePrefix}-orders-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.orderTitle } }],
    });
    tableIds.push(orders.id);
    const valueId = products.fields.find(
      (field: { name: string }) => field.name === VALUE_FIELD,
    )?.id;
    if (!valueId) {
      throw new Error(`table ${products.id} has no ${VALUE_FIELD} column`);
    }

    const link = await createField(orders.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: products.id,
      },
    });
    await updateRecordByApi(
      orders.id,
      orders.records[0].id,
      link.id,
      products.records.map((record: { id: string }) => ({ id: record.id })),
    );
    const rollup = await createField(orders.id, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      options: {
        expression: "max({values})",
        formatting: { type: NumberFormattingType.Decimal, precision: 3 },
        showAs: {
          type: SingleNumberDisplayType.Ring,
          color: Colors.Blue,
          showValue: true,
          maxValue: 100,
        },
      },
      lookupOptions: {
        linkFieldId: link.id,
        foreignTableId: products.id,
        lookupFieldId: valueId,
      },
    });
    const numeric = await getField(orders.id, rollup.id);
    if (numeric.cellValueType !== "number" || !numeric.options?.showAs) {
      throw new Error(
        `the rollup starts as ${numeric.cellValueType} with options ${JSON.stringify(numeric.options)}; ` +
          "it has to be a number with a ring for the reset to be observable",
      );
    }

    const probe = await bugCheckpoint(
      "a-rollup-follows-its-source-from-number-to-date",
      async () => {
        const converted = await rawRequest(
          "PUT",
          `/table/${products.id}/field/${valueId}/convert`,
          { type: FieldType.Date },
        );
        if (!isSuccess(converted)) {
          throw new Error(
            `converting the number column to a date answered ${describeResponse(converted)}`,
          );
        }
        const routing = assertServedByV2(converted.headers, {
          operation: "PUT /table/{tableId}/field/{fieldId}/convert",
          feature: "convertField",
        });
        const after = await getField(orders.id, rollup.id);
        const options = (after.options ?? {}) as Record<string, unknown>;
        const formatting = options.formatting as
          | Record<string, unknown>
          | undefined;
        const problems: string[] = [];
        if (after.cellValueType !== "dateTime") {
          problems.push(`cellValueType is ${String(after.cellValueType)}`);
        }
        if ("showAs" in options) {
          problems.push(
            `a ring display is still set (${JSON.stringify(options.showAs)})`,
          );
        }
        if (!formatting || typeof formatting.date !== "string") {
          problems.push(
            `formatting is not a date format (${JSON.stringify(formatting)})`,
          );
        }
        if (problems.length > 0) {
          throw new Error(
            `after the source became a date the rollup is not one: ${problems.join("; ")}`,
          );
        }
        return { routing, options };
      },
    );

    return {
      details: { ordersTableId: orders.id, rollupOptions: probe.options },
    };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
