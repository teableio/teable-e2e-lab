import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  getFields as apiGetFields,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SymmetricLinkWriteCaseConfig } from "../types";

// A two-way link, written from the far side -> checkpoint: the near side says
// the same thing.
//
// A two-way link is one relationship shown twice: "this order contains these
// items" on one table and "this item belongs to these orders" on the other.
// Which side someone fills in is a matter of where they happen to be working,
// and both sides are supposed to be the same fact.
//
// Writing the far side did not reach the near side. The item says it belongs
// to the order; the order does not list the item. Neither side is marked as
// wrong, so which one is believed depends on which table the reader opened,
// and a count of items per order is short by exactly the ones filled in from
// the item's side.
//
// Clearing is the other half and is asserted too: emptied from the far side,
// the near side has to let go as well - a fix that only propagated additions
// would leave links nobody can remove.

const NAME_FIELD = "Name";
const LINK_FIELD = "Items";

export const runSymmetricLinkWriteCase = async (
  bugCase: BugCaseFor<"symmetric-link-write">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SymmetricLinkWriteCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const items = await createTable(baseId, {
      name: `${suffix}-items`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.itemTitle } }],
    });
    createdTableIds.unshift(items.id);
    const itemId = items.records[0]?.id;

    const orders = await createTable(baseId, {
      name: `${suffix}-orders`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.orderTitle } }],
    });
    createdTableIds.unshift(orders.id);
    const orderId = orders.records[0]?.id;
    if (!itemId || !orderId) {
      throw new Error("the fixture tables are not in place");
    }

    // The relationship, created from the order's side. The product makes the
    // other side of it on the items table by itself - that is the column this
    // case writes through.
    const linkField = await createField(orders.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        // One-many, so the column the product makes on the other table holds
        // a single value rather than a list. Many-many is green on both
        // columns (run 32697213211): that shape already propagates.
        relationship: Relationship.OneMany,
        foreignTableId: items.id,
        isOneWay: false,
      },
    });
    const symmetricFieldId = (
      linkField.options as { symmetricFieldId?: string }
    ).symmetricFieldId;
    if (!symmetricFieldId) {
      throw new Error(
        "the link has no other side - the fixture is not in place",
      );
    }
    // It really is a column on the items table.
    const itemFields = await apiGetFields(items.id, {
      fieldKeyType: FieldKeyType.Id,
    });
    if (
      !itemFields.data.some(
        (field: { id: string }) => field.id === symmetricFieldId,
      )
    ) {
      throw new Error(
        `the other side of the link is not a column on ${items.id}`,
      );
    }

    const orderLinks = async () => {
      const read = await apiGetRecords(orders.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const raw = read.data.records[0]?.fields[linkField.id];
      return (Array.isArray(raw) ? raw : raw ? [raw] : []) as { id?: string }[];
    };

    // Fixture verification, outside the checkpoint: nothing is linked yet.
    const before = await orderLinks();
    if (before.length !== 0) {
      throw new Error(
        `the order already lists ${JSON.stringify(before)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "writing-one-side-of-a-link-reaches-the-other",
      async () => {
        // Fill the relationship in from the item's side.
        await apiUpdateRecord(items.id, itemId, {
          fieldKeyType: FieldKeyType.Id,
          record: { fields: { [symmetricFieldId]: { id: orderId } } },
        });

        const linked = await orderLinks();
        if (!linked.some((entry) => entry.id === itemId)) {
          throw new Error(
            `the item says it belongs to the order, and the order lists ${JSON.stringify(linked)} - the two ` +
              "sides of one relationship disagree, and which is believed depends on which table is open",
          );
        }

        // And the other half: emptied from the item's side, the order has to
        // let go too.
        await apiUpdateRecord(items.id, itemId, {
          fieldKeyType: FieldKeyType.Id,
          record: { fields: { [symmetricFieldId]: null } },
        });
        const cleared = await orderLinks();
        if (cleared.some((entry) => entry.id === itemId)) {
          throw new Error(
            `the item was unlinked from the order's side of the relationship but the order still lists ` +
              `${JSON.stringify(cleared)} - the link cannot be removed from the side it was made on`,
          );
        }
        return { linkedCount: linked.length, clearedCount: cleared.length };
      },
    );

    return {
      details: {
        ordersTableId: orders.id,
        itemsTableId: items.id,
        symmetricFieldId,
        linkedCount: probe.linkedCount,
        clearedCount: probe.clearedCount,
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
