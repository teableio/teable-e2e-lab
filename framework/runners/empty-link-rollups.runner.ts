import { FieldType, Relationship } from "@teable/core";
import {
  createField,
  createTable,
  getRecord,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { getRecords as apiGetRecords } from "@teable/openapi";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  EmptyLinkRollupsCaseConfig,
} from "../types";
import { dropTables } from "./raw-api";

// Rollups over a link with nothing in it - one row that never had links, one
// whose links were removed -> checkpoint: an average and an exclusive-or of
// nothing are empty, while a sum of nothing is 0.
//
// "No data" and "zero" are different answers, and a total built on the wrong
// one is wrong without looking it. An average of no prices read 0, so a
// product with no reviews averaged zero stars and dragged every ranking down;
// an exclusive-or of no flags read false, the same as a real "no". Worse, a
// row whose links were all removed went on reading 0 and false rather than
// returning to empty. The sum beside them is the control: 0 is the right
// answer for a sum of nothing, and a fix that emptied every rollup would
// fail it.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const FLAG_FIELD = "Flag";
const LINK_FIELD = "Items";

export const runEmptyLinkRollupsCase = async (
  bugCase: BugCaseFor<"empty-link-rollups">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: EmptyLinkRollupsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  const amounts = config.items.map((item) => item.amount);
  const average =
    amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
  const checked = config.items.filter((item) => item.flag).length;
  if (amounts.length < 2 || checked % 2 === 0) {
    throw new Error(
      "link at least two items with an odd number of flags, so the linked row reads a real average and a true exclusive-or",
    );
  }

  try {
    const items = await createTable(baseId, {
      name: `${config.tableNamePrefix}-items-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
        { name: FLAG_FIELD, type: FieldType.Checkbox },
      ],
      records: config.items.map((item) => ({
        fields: {
          [NAME_FIELD]: item.name,
          [AMOUNT_FIELD]: item.amount,
          ...(item.flag ? { [FLAG_FIELD]: true } : {}),
        },
      })),
    });
    tableIds.push(items.id);
    const host = await createTable(baseId, {
      name: `${config.tableNamePrefix}-host-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [NAME_FIELD]: "never-linked" } },
        { fields: { [NAME_FIELD]: "unlinked" } },
      ],
    });
    tableIds.push(host.id);
    const fieldId = (name: string) =>
      items.fields.find((field: { name: string }) => field.name === name)?.id;
    const amountId = fieldId(AMOUNT_FIELD);
    const flagId = fieldId(FLAG_FIELD);
    if (!amountId || !flagId) {
      throw new Error(`table ${items.id} is not in place`);
    }
    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: items.id,
      },
    });
    const rollup = (name: string, expression: string, lookupFieldId: string) =>
      createField(host.id, {
        name,
        type: FieldType.Rollup,
        options: { expression },
        lookupOptions: {
          linkFieldId: link.id,
          foreignTableId: items.id,
          lookupFieldId,
        },
      });
    const averageField = await rollup("Average", "average({values})", amountId);
    const sumField = await rollup("Sum", "sum({values})", amountId);
    const xorField = await rollup("Xor", "xor({values})", flagId);

    const [neverLinkedId, unlinkedId] = host.records.map(
      (record: { id: string }) => record.id,
    );
    await updateRecordByApi(
      host.id,
      unlinkedId,
      link.id,
      items.records.map((record: { id: string }) => ({ id: record.id })),
    );
    const read = async (recordId: string) => {
      const fields = (await getRecord(host.id, recordId)).fields;
      return {
        average: fields[averageField.id] ?? null,
        sum: fields[sumField.id] ?? null,
        xor: fields[xorField.id] ?? null,
      };
    };
    // The linked state has to be real before it is taken away.
    const linked = await read(unlinkedId);
    if (linked.average !== average || linked.xor !== true) {
      throw new Error(
        `with every item linked the row reads ${JSON.stringify(linked)}, expected average ${average} and xor true`,
      );
    }
    await updateRecordByApi(host.id, unlinkedId, link.id, null);

    const probe = await bugCheckpoint(
      "rollups-of-nothing-are-empty-except-the-sum",
      async () => {
        const listed = await apiGetRecords(host.id, {});
        const routing = assertServedByV2(listed.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const rows = {
          "never linked": await read(neverLinkedId),
          "links removed": await read(unlinkedId),
        };
        const wrong = Object.entries(rows)
          .filter(
            ([, row]) =>
              row.average !== null || row.xor !== null || row.sum !== 0,
          )
          .map(([label, row]) => `${label}: ${JSON.stringify(row)}`);
        if (wrong.length > 0) {
          throw new Error(
            `rollups over an empty link should read average null, xor null, sum 0, but ${wrong.join("; ")}`,
          );
        }
        return { routing, rows };
      },
    );

    return { details: { hostTableId: host.id, rows: probe.rows } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
