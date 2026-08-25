import { FieldKeyType, FieldType, is, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  getRowCount as apiGetRowCount,
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
import type { LinkedRowOutsideTheScopeCaseConfig } from "../types";

// A link column narrowed to the rows in one view, holding a row that is not in
// that view -> open the row -> checkpoint: the linked row is shown.
//
// Narrowing a link column to a view is how a base keeps people picking from
// the right list: only current suppliers, only this year's projects. It is a
// rule about what can be chosen from now on.
//
// It was read as a rule about what can be shown. A row linked before the
// narrowing - or before the other row dropped out of that view, which happens
// on its own as data changes - stopped being displayed: the panel is blank and
// the count says nothing is linked, while the link is right there in the data
// and comes back on any ordinary read.
//
// The two go together in the checkpoint. The blank panel is what a person
// sees; the count saying nothing is linked is what makes them believe it.

const NAME_FIELD = "Name";
const LINK_FIELD = "Supplier";

export const runLinkedRowOutsideTheScopeCase = async (
  bugCase: BugCaseFor<"linked-row-outside-the-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkedRowOutsideTheScopeCaseConfig = bugCase.config;
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
      "a-linked-row-outside-the-pick-list-is-still-shown",
      async () => {
        const selected: [string, string] = [link.id, hostRowId];
        const shown = await apiGetRecords(foreign.id, {
          fieldKeyType: FieldKeyType.Id,
          viewId: foreignViewId,
          take: 10,
          filterLinkCellSelected: selected,
        });
        const ids = shown.data.records.map(
          (record: { id: string }) => record.id,
        );
        if (ids.join(",") !== outOfViewRowId) {
          throw new Error(
            `opening the row shows ${JSON.stringify(ids)} as linked, expected the supplier it is linked to - ` +
              "the link is in the data and the panel is blank",
          );
        }

        // The number beside it, worked out separately - and what makes a
        // person believe the blank panel.
        const counted = await apiGetRowCount(foreign.id, {
          viewId: foreignViewId,
          filterLinkCellSelected: selected,
        });
        if (counted.data.rowCount !== 1) {
          throw new Error(
            `the count says ${counted.data.rowCount} rows are linked, expected 1`,
          );
        }
        return { ids, rowCount: counted.data.rowCount };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
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
