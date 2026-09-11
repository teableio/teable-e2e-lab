import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  deleteRecord as apiDeleteRecord,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TwoWayLinkDeleteCleanupCaseConfig } from "../types";

// A row that several other rows are linked to -> delete one of them ->
// checkpoint: the cell that listed it stops naming it.
//
// A deleted row that is still named somewhere is the worst kind of leftover.
// The name is still shown, counts and filters still include it, and clicking it
// finds nothing - and the table where the damage shows is not the table
// anybody deleted from, so the two are rarely connected.
//
// Clearing those cells is done by looking at what the link is made of, and for
// a two-way link between one row here and many rows there, the pieces are split
// across the two tables: the key is on the rows being deleted, the column that
// displays them is on the other side. The cleanup looked for both on the table
// being deleted from, did not find one, and quietly skipped - leaving the
// displayed name behind on the side nobody touched.
//
// The other linked row rides along as the control. A cleanup that emptied the
// whole cell would also make the deleted name disappear, and would be worse
// than the fault.

const NAME_FIELD = "Name";
const LINK_FIELD = "Items";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runTwoWayLinkDeleteCleanupCase = async (
  bugCase: BugCaseFor<"two-way-link-delete-cleanup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TwoWayLinkDeleteCleanupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.linkedRowNames.length < 2) {
    throw new Error(
      "two linked rows at least - with one, a cell that was emptied altogether and a cell that was cleared " +
        "correctly are the same answer",
    );
  }

  try {
    const items = await createTable(baseId, {
      name: `${suffix}-items`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.linkedRowNames.map((name) => ({
        fields: { [NAME_FIELD]: name },
      })),
    });
    createdTableIds.unshift(items.id);
    const itemRows = items.records as {
      id: string;
      fields: Record<string, unknown>;
    }[];

    const orders = await createTable(baseId, {
      name: `${suffix}-orders`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowName } }],
    });
    createdTableIds.unshift(orders.id);
    const orderRowId = orders.records?.[0]?.id as string;

    // One row here, many rows there, and the link shown on both sides - which
    // is what splits the pieces the cleanup needs across two tables.
    const link = await createField(orders.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: items.id,
        isOneWay: false,
      },
    });

    const linkCell = async () => {
      const response = await apiGetRecords(orders.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const cell = response.data.records[0]?.fields[link.id];
      return {
        headers: response.headers,
        titles: Array.isArray(cell)
          ? (cell as { title?: string }[]).map((entry) => entry.title ?? "")
          : [],
      };
    };

    // Link every item to the one order row.
    await apiUpdateRecord(orders.id, orderRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: { [link.id]: itemRows.map((row) => ({ id: row.id })) },
      },
    });

    // Fixture verification, outside the checkpoint: the cell really lists every
    // linked row by name. A cell that was never filled in cannot be observed to
    // lose anything.
    const before = await linkCell();
    assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const missing = config.linkedRowNames.filter(
      (name) => !before.titles.includes(name),
    );
    if (missing.length > 0) {
      throw new Error(
        `before the delete the cell lists ${JSON.stringify(before.titles)}, expected ` +
          `${JSON.stringify(config.linkedRowNames)} - the fixture is not in place`,
      );
    }

    const deletedName = config.linkedRowNames[0]!;
    const deletedRowId = itemRows[0]!.id;
    const survivors = config.linkedRowNames.slice(1);

    const probe = await bugCheckpoint(
      "a-deleted-row-stops-being-named-on-the-other-side",
      async () => {
        await apiDeleteRecord(items.id, deletedRowId);

        const deadline = Date.now() + config.settleTimeoutMs;
        let seen = await linkCell();
        while (seen.titles.includes(deletedName) && Date.now() < deadline) {
          await sleep(config.pollIntervalMs);
          seen = await linkCell();
        }

        if (seen.titles.includes(deletedName)) {
          throw new Error(
            `${config.settleTimeoutMs}ms after the row was deleted the cell still lists ` +
              `${JSON.stringify(seen.titles)} - the name of a row that no longer exists is still shown on a table ` +
              "nobody deleted from",
          );
        }
        const lost = survivors.filter((name) => !seen.titles.includes(name));
        if (lost.length > 0) {
          throw new Error(
            `the deleted row is gone from the cell and so is ${JSON.stringify(lost)} - the cleanup emptied the ` +
              "cell rather than clearing one row out of it",
          );
        }
        return { titles: seen.titles };
      },
    );

    return {
      details: {
        ordersTableId: orders.id,
        itemsTableId: items.id,
        deletedName,
        titlesBefore: before.titles,
        titlesAfter: probe.titles,
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
