import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  CONVERT_FIELD,
  axios,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkNarrowedRollupRefreshCaseConfig } from "../types";

// Orders linked to customers, each customer totalling its orders' amounts ->
// the link is widened to many-to-many, one order is linked to two customers,
// then the link is narrowed back to one customer per order -> checkpoint: the
// customer the order was dropped from no longer counts it.
//
// Narrowing the link keeps one customer per order and drops the rest. The
// orders table showed the right customers afterwards, and the customers' own
// list of orders was right too. But the customer an order had been dropped
// from kept its amount in the total: the total was never worked out again,
// because both tables were mid-change when the recalculation was planned, and
// the plan skipped tables in that state.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const LINK_FIELD = "Customer";
const TOTAL_FIELD = "Orders total";

export const runLinkNarrowedRollupRefreshCase = async (
  bugCase: BugCaseFor<"link-narrowed-rollup-refresh">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkNarrowedRollupRefreshCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const customers = await createTable(baseId, {
      name: `${suffix}-customers`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [NAME_FIELD]: "A" } },
        { fields: { [NAME_FIELD]: "B" } },
      ],
    });
    createdTableIds.unshift(customers.id);
    const [customerA, customerB] = customers.records.map(
      (record: { id: string }) => record.id,
    ) as [string, string];

    const orders = await createTable(baseId, {
      name: `${suffix}-orders`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "moved",
            [AMOUNT_FIELD]: config.movedAmount,
          },
        },
        {
          fields: {
            [NAME_FIELD]: "stays",
            [AMOUNT_FIELD]: config.stayingAmount,
          },
        },
      ],
    });
    createdTableIds.unshift(orders.id);
    const [moved, stays] = orders.records.map(
      (record: { id: string }) => record.id,
    ) as [string, string];
    const amountFieldId = orders.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;

    const link = await createField(orders.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: customers.id,
        isOneWay: false,
      },
    });
    const symmetricFieldId = (link.options as { symmetricFieldId?: string })
      ?.symmetricFieldId;
    if (!symmetricFieldId) {
      throw new Error("the link has no field on the customers' side");
    }
    const total = await createField(customers.id, {
      name: TOTAL_FIELD,
      type: FieldType.Rollup,
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: orders.id,
        linkFieldId: symmetricFieldId,
        lookupFieldId: amountFieldId,
      },
    });

    // Both orders start with customer B.
    for (const orderId of [moved, stays]) {
      await apiUpdateRecord(orders.id, orderId, {
        fieldKeyType: FieldKeyType.Id,
        record: { fields: { [link.id]: { id: customerB } } },
      });
    }

    const convert = (relationship: Relationship) =>
      axios.put(
        urlBuilder(CONVERT_FIELD, { tableId: orders.id, fieldId: link.id }),
        {
          name: LINK_FIELD,
          type: FieldType.Link,
          options: {
            relationship,
            foreignTableId: customers.id,
            isOneWay: false,
          },
        },
        { validateStatus: () => true },
      );

    // Widen to many-to-many and link the moved order to A as well as B.
    const widened = await convert(Relationship.ManyMany);
    assertServedByV2(widened.headers, {
      operation: "PUT /table/{tableId}/field/{fieldId}/convert",
      feature: "convertField",
    });
    if (widened.status >= 300) {
      throw new Error(
        `widening the link answered ${widened.status}: ${JSON.stringify(widened.data)}`,
      );
    }
    await apiUpdateRecord(orders.id, moved, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: { [link.id]: [{ id: customerA }, { id: customerB }] },
      },
    });

    const readTotals = async () => {
      const response = await apiGetRecords(customers.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 3,
      });
      const byId = new Map<string, unknown>(
        response.data.records.map(
          (record: { id: string; fields: Record<string, unknown> }) => [
            record.id,
            record.fields[total.id] ?? null,
          ],
        ),
      );
      return {
        headers: response.headers,
        a: byId.get(customerA) ?? null,
        b: byId.get(customerB) ?? null,
      };
    };

    // Fixture verification, outside the checkpoint: with the moved order on
    // both customers, A counts it and B counts both orders.
    const before = await readTotals();
    const readRouting = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const both = config.movedAmount + config.stayingAmount;
    if (before.a !== config.movedAmount || before.b !== both) {
      throw new Error(
        `before narrowing, the totals read A=${JSON.stringify(before.a)} B=${JSON.stringify(before.b)}, ` +
          `expected A=${config.movedAmount} B=${both} - the fixture is not in place`,
      );
    }

    // Narrow back to one customer per order. The moved order keeps A.
    const narrowed = await convert(Relationship.ManyOne);
    const narrowRouting = assertServedByV2(narrowed.headers, {
      operation: "PUT /table/{tableId}/field/{fieldId}/convert",
      feature: "convertField",
    });

    const probe = await bugCheckpoint(
      "narrowing-a-link-takes-a-dropped-order-out-of-its-total",
      async () => {
        if (narrowed.status >= 300) {
          throw new Error(
            `narrowing the link answered ${narrowed.status}: ${JSON.stringify(narrowed.data)}`,
          );
        }
        const kept = (
          await apiGetRecords(orders.id, {
            fieldKeyType: FieldKeyType.Id,
            take: 3,
          })
        ).data.records.find((record: { id: string }) => record.id === moved)
          ?.fields[link.id] as { id?: string } | undefined;
        const after = await readTotals();
        const problems: string[] = [];
        if (after.a !== config.movedAmount) {
          problems.push(
            `customer A totals ${JSON.stringify(after.a)}, expected ${config.movedAmount}`,
          );
        }
        if (after.b !== config.stayingAmount) {
          problems.push(
            `customer B totals ${JSON.stringify(after.b)}, expected ${config.stayingAmount} - ` +
              (after.b === both
                ? "it still counts the order that was dropped from it"
                : "it is neither the old total nor the new one"),
          );
        }
        if (problems.length > 0) {
          throw new Error(
            `after narrowing the link, the moved order is on ${JSON.stringify(kept ?? null)}; ${problems.join("; ")}`,
          );
        }
        return { kept, totals: { a: after.a, b: after.b } };
      },
    );

    const fieldsAfter = await getFields(orders.id);
    return {
      details: {
        tableIds: createdTableIds,
        readRouting,
        narrowRouting,
        linkRelationship: (
          fieldsAfter.find((field) => field.id === link.id)?.options as
            | { relationship?: string }
            | undefined
        )?.relationship,
        movedOrderKept: probe.kept,
        totals: probe.totals,
      },
    };
  } finally {
    for (const tableId of createdTableIds) {
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
