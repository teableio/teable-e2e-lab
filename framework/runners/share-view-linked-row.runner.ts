import { FieldKeyType, FieldType, is, Relationship } from "@teable/core";
import {
  enableShareView as apiEnableShareView,
  getRecords as apiGetRecords,
  getShareViewRecords as apiGetShareViewRecords,
  getShareViewRowCount as apiGetShareViewRowCount,
  updateRecord as apiUpdateRecord,
  updateViewFilter as apiUpdateViewFilter,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ShareViewLinkedRowCaseConfig } from "../types";

// A link column narrowed to the rows in one view, holding a row that is not in
// that view -> open the shared page and ask what that cell has linked ->
// checkpoint: the linked row is named, and the count beside it says one.
//
// Narrowing a link column to a view is how a base keeps people picking from
// the right list: only current suppliers, only this year's projects. It is a
// rule about what can be chosen from now on.
//
// It was read as a rule about what can be shown. A row linked before the
// narrowing - or before the other row dropped out of that view, which happens
// on its own as data changes - stopped being displayed on the shared page: the
// cell is blank and the count says nothing is linked, while the link is right
// there in the data.
//
// The shared page is where this hurts most. The person looking at it cannot
// open the base, cannot check the underlying data, and has no way to tell an
// empty cell from a cell they are not being shown.

const NAME_FIELD = "Name";
const LINK_FIELD = "Supplier";

export const runShareViewLinkedRowCase = async (
  bugCase: BugCaseFor<"share-view-linked-row">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ShareViewLinkedRowCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.inViewName === config.outOfViewName) {
    throw new Error(
      "the two rows have to be named differently, or the view's filter cannot keep one and drop the other",
    );
  }

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-suppliers`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [NAME_FIELD]: config.inViewName } },
        { fields: { [NAME_FIELD]: config.outOfViewName } },
      ],
    });
    createdTableIds.unshift(foreign.id);
    const foreignViewId = foreign.views?.[0]?.id;
    const foreignPrimaryId = foreign.fields[0]?.id;
    const outOfViewRowId = foreign.records?.[1]?.id;
    if (!foreignViewId || !foreignPrimaryId || !outOfViewRowId) {
      throw new Error("the suppliers table is not in place");
    }

    // The list people are meant to pick from: one of the two rows.
    await apiUpdateViewFilter(foreign.id, foreignViewId, {
      filter: {
        conjunction: "and",
        filterSet: [
          {
            fieldId: foreignPrimaryId,
            operator: is.value,
            value: config.inViewName,
          },
        ],
      },
    });

    const host = await createTable(baseId, {
      name: `${suffix}-orders`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowName } }],
    });
    createdTableIds.unshift(host.id);
    const hostRowId = host.records?.[0]?.id;
    if (!hostRowId) {
      throw new Error("the orders table is not in place");
    }

    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
        filterByViewId: foreignViewId,
      },
    });

    // The row is linked to the supplier that is not in that view - which is
    // what a row linked before the narrowing looks like afterwards.
    await apiUpdateRecord(host.id, hostRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [link.id]: { id: outOfViewRowId } } },
    });

    // The page a person outside the base is given.
    const shared = await apiEnableShareView({
      tableId: host.id,
      viewId: host.views?.[0]?.id ?? "",
    });
    const shareId = shared.data.shareId;
    if (!shareId) {
      throw new Error(
        `sharing the orders view produced no link: ${JSON.stringify(shared.data)}`,
      );
    }

    // Fixture verification, outside the checkpoint: the link is in the data.
    // If the write had been refused there would be nothing to display and the
    // checkpoint would be watching an empty cell.
    const hostRows = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const cell = hostRows.data.records.find(
      (record: { id: string }) => record.id === hostRowId,
    )?.fields[link.id] as { id?: string } | undefined;
    if (cell?.id !== outOfViewRowId) {
      throw new Error(
        `the order is linked to ${JSON.stringify(cell)}, expected the supplier outside the view - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-shared-page-shows-a-linked-row-outside-the-pick-list",
      async () => {
        const selected: [string, string] = [link.id, hostRowId];
        const shown = await apiGetShareViewRecords(shareId, {
          fieldKeyType: FieldKeyType.Id,
          take: 10,
          filterLinkCellSelected: selected,
        });
        const ids = shown.data.records.map(
          (record: { id: string }) => record.id,
        );
        if (ids.join(",") !== outOfViewRowId) {
          throw new Error(
            `the shared page shows ${JSON.stringify(ids)} as linked, expected the supplier the row is linked to - ` +
              "the link is in the data and the cell is blank, and the person looking cannot open the base to check",
          );
        }

        const counted = await apiGetShareViewRowCount(shareId, {
          filterLinkCellSelected: selected,
        });
        if (counted.data.rowCount !== 1) {
          throw new Error(
            `the shared page counts ${counted.data.rowCount} linked rows, expected 1`,
          );
        }
        return { ids, rowCount: counted.data.rowCount };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        shareId,
        linkedRowId: outOfViewRowId,
        shown: probe.ids,
        rowCount: probe.rowCount,
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
