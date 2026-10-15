import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createField,
  createTable,
  getFields,
  getRecord,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  DeletedLinkErrorChainCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// Orders linked to products, with a looked-up price, a rolled-up total and a
// formula over the total -> delete the link -> checkpoint: all three columns
// are marked broken, the formula included.
//
// A column built on a column built on a link loses its source when the link
// goes. The two columns that read the link directly were marked broken; the
// formula one step further down was not. It went on presenting as a healthy
// column with nothing in it - the shape of "no orders yet" rather than "this
// stopped working" - so whatever reads it, a total, a report, a threshold,
// quietly reads zero.

const NAME_FIELD = "Name";
const PRICE_FIELD = "Price";
const LINK_FIELD = "Products";
const LOOKUP_FIELD = "Prices";
const ROLLUP_FIELD = "Total";
const FORMULA_FIELD = "Doubled";

export const runDeletedLinkErrorChainCase = async (
  bugCase: BugCaseFor<"deleted-link-error-chain">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeletedLinkErrorChainCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  if (config.linkedProducts.length < 2) {
    throw new Error(
      "link at least two products, so the total is a sum rather than a copy of one price",
    );
  }

  try {
    const products = await createTable(baseId, {
      name: `${config.tableNamePrefix}-products-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: PRICE_FIELD, type: FieldType.Number },
      ],
      records: config.products.map((product) => ({
        fields: { [NAME_FIELD]: product.name, [PRICE_FIELD]: product.price },
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

    const priceFieldId = products.fields.find(
      (field: { name: string }) => field.name === PRICE_FIELD,
    )?.id;
    if (!priceFieldId) {
      throw new Error(`table ${products.id} has no ${PRICE_FIELD} column`);
    }
    const link = await createField(orders.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: products.id,
      },
    });
    const lookupOptions = {
      linkFieldId: link.id,
      foreignTableId: products.id,
      lookupFieldId: priceFieldId,
    };
    const lookup = await createField(orders.id, {
      name: LOOKUP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions,
    });
    const rollup = await createField(orders.id, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      options: { expression: "sum({values})" },
      lookupOptions,
    });
    const formula = await createField(orders.id, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${rollup.id}} * 2` },
    });

    const linkedIds = config.linkedProducts.map((name) => {
      const index = config.products.findIndex(
        (product) => product.name === name,
      );
      const record = products.records[index];
      if (!record) {
        throw new Error(`product ${name} is not in the fixture`);
      }
      return { id: record.id };
    });
    const orderId = orders.records[0].id;
    await updateRecordByApi(orders.id, orderId, link.id, linkedIds);

    // The chain has to be alive before the delete, or "broken" means nothing.
    const total = config.linkedProducts
      .map(
        (name) =>
          config.products.find((product) => product.name === name)?.price ?? 0,
      )
      .reduce((sum, price) => sum + price, 0);
    const before = await getRecord(orders.id, orderId);
    if (
      before.fields[rollup.id] !== total ||
      before.fields[formula.id] !== total * 2
    ) {
      throw new Error(
        `before the delete the total reads ${JSON.stringify(before.fields[rollup.id])} and the formula ` +
          `${JSON.stringify(before.fields[formula.id])}, expected ${total} and ${total * 2}`,
      );
    }

    const probe = await bugCheckpoint(
      "every-column-downstream-of-a-deleted-link-is-marked-broken",
      async () => {
        const deleted = await rawRequest(
          "DELETE",
          `/table/${orders.id}/field/${link.id}`,
        );
        if (!isSuccess(deleted)) {
          throw new Error(
            `deleting the link answered ${describeResponse(deleted)}`,
          );
        }
        const routing = assertServedByV2(deleted.headers, {
          operation: "DELETE /table/{tableId}/field/{fieldId}",
          feature: "deleteField",
        });
        const fields = await getFields(orders.id);
        const state = [lookup, rollup, formula].map((field) => {
          const now = fields.find(
            (candidate: { id: string }) => candidate.id === field.id,
          );
          return {
            name: field.name,
            present: Boolean(now),
            hasError: now?.hasError === true,
          };
        });
        const healthy = state.filter((field) => !field.hasError);
        if (healthy.length > 0) {
          throw new Error(
            `after deleting the link these columns still read as healthy: ${healthy
              .map((field) =>
                field.present ? field.name : `${field.name} (gone)`,
              )
              .join(
                ", ",
              )}; all three were built on it. State: ${JSON.stringify(state)}`,
          );
        }
        return { routing, state };
      },
    );

    return { details: { ordersTableId: orders.id, state: probe.state } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
