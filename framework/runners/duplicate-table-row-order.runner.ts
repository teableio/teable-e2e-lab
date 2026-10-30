import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  DuplicateTableRowOrderCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A table with a many-one link whose third row was inserted between the first
// two in its grid view -> duplicate the table with its records through the
// base-node route -> checkpoint: the duplicate exists and its grid lists the
// rows in the source's view order.
//
// Duplicating a table with records copies each view's row order, which needs
// a row-order column created on the new table inside the duplicate's
// transaction. That DDL ran outside it, against a table the transaction had
// not committed yet, so duplicating a table someone had reordered failed (or
// lost the order) instead of producing a copy. The link column is part of the
// reported shape: it makes the duplicate copy a junction-side table too.

const NAME_FIELD = "Name";

export const runDuplicateTableRowOrderCase = async (
  bugCase: BugCaseFor<"duplicate-table-row-order">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateTableRowOrderCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const name = (part: string) =>
    `${config.tableNamePrefix}-${part}-${context.runId}`;

  try {
    const foreign = await createTable(baseId, {
      name: name("foreign"),
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.push(foreign.id);
    const source = await createTable(baseId, {
      name: name("source"),
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: "Company",
          type: FieldType.Link,
          options: {
            relationship: Relationship.ManyOne,
            foreignTableId: foreign.id,
            lookupFieldId: foreign.fields[0].id,
          },
        },
      ],
      records: [],
    });
    tableIds.push(source.id);
    const viewId = source.views[0].id;

    const insert = async (
      rows: string[],
      order?: { anchorId: string; position: "before" | "after" },
    ) => {
      const created = await rawRequest<{ records?: { id: string }[] }>(
        "POST",
        `/table/${source.id}/record`,
        {
          fieldKeyType: FieldKeyType.Name,
          records: rows.map((row) => ({ fields: { [NAME_FIELD]: row } })),
          ...(order ? { order: { viewId, ...order } } : {}),
        },
      );
      if (!isSuccess(created) || !created.data?.records) {
        throw new Error(
          `inserting ${rows.join(", ")} answered ${describeResponse(created)}`,
        );
      }
      return created.data.records;
    };
    const readOrder = async (tableId: string, view: string) => {
      const read = await rawRequest<{
        records?: { fields: Record<string, unknown> }[];
      }>("GET", `/table/${tableId}/record?viewId=${view}&fieldKeyType=name`);
      if (!isSuccess(read)) {
        throw new Error(
          `reading ${tableId} answered ${describeResponse(read)}`,
        );
      }
      return (read.data.records ?? []).map(
        (record) => record.fields[NAME_FIELD],
      );
    };

    const [first, second] = config.rows;
    const [, anchor] = await insert([first, second]);
    await insert([config.insertedBetween], {
      anchorId: anchor.id,
      position: "before",
    });
    const expected = [first, config.insertedBetween, second];
    const sourceOrder = await readOrder(source.id, viewId);
    if (JSON.stringify(sourceOrder) !== JSON.stringify(expected)) {
      throw new Error(
        `the source view lists ${JSON.stringify(sourceOrder)}, expected ${JSON.stringify(expected)} - the reorder did not take`,
      );
    }

    const nodes = await rawRequest<{ id: string; resourceId?: string }[]>(
      "GET",
      `/base/${baseId}/node/list`,
    );
    const node = isSuccess(nodes)
      ? nodes.data.find((candidate) => candidate.resourceId === source.id)
      : undefined;
    if (!node) {
      throw new Error(
        `no base node for the source table (${describeResponse(nodes)})`,
      );
    }

    const probe = await bugCheckpoint(
      "a-duplicated-table-keeps-its-rows-in-view-order",
      async () => {
        const duplicated = await rawRequest<{ resourceId?: string }>(
          "POST",
          `/base/${baseId}/node/${node.id}/duplicate`,
          { name: name("copy"), includeRecords: true },
        );
        if (duplicated.data?.resourceId) {
          tableIds.push(duplicated.data.resourceId);
        }
        if (!isSuccess(duplicated) || !duplicated.data?.resourceId) {
          throw new Error(
            `duplicating the reordered table answered ${describeResponse(duplicated)}`,
          );
        }
        const copyId = duplicated.data.resourceId;
        const views = await rawRequest<{ id: string }[]>(
          "GET",
          `/table/${copyId}/view`,
        );
        const copyViewId = isSuccess(views) ? views.data[0]?.id : undefined;
        if (!copyViewId) {
          throw new Error(
            `the duplicate has no view (${describeResponse(views)})`,
          );
        }
        const copyOrder = await readOrder(copyId, copyViewId);
        if (JSON.stringify(copyOrder) !== JSON.stringify(expected)) {
          throw new Error(
            `the duplicate's view lists ${JSON.stringify(copyOrder)}, expected the source's order ${JSON.stringify(expected)}`,
          );
        }
        return { copyId, copyOrder };
      },
    );

    return { details: { sourceTableId: source.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
