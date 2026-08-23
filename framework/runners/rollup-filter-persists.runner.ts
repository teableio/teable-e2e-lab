import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RollupFilterPersistsCaseConfig } from "../types";

// A rollup over linked rows, narrowed with a condition -> checkpoint: the
// condition is saved, and the number counts only what it selects.
//
// "Sum of the paid invoices", "hours on billable tasks only" - a rollup's
// More options filter is how a summary stops counting everything it can see.
// Converting the field mapped its link and lookup ids and dropped the filter,
// so the condition never persisted: the dialog closed, the column went on
// showing the total of everything, and the number looked plausible enough to
// use.
//
// The assertion is the number as well as the saved condition. A build that
// stored the filter and ignored it in the query would be the same wrong total
// with better-looking metadata.

const NAME_FIELD = "Name";
const CATEGORY_FIELD = "Category";
const AMOUNT_FIELD = "Amount";
const LINK_FIELD = "Items";
const ROLLUP_FIELD = "Total";
const HOST_ROW = "the-report";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runRollupFilterPersistsCase = async (
  bugCase: BugCaseFor<"rollup-filter-persists">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RollupFilterPersistsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let itemTableId = "";
  let hostTableId = "";

  const matching = config.items.filter(
    (item) => item.category === config.countedCategory,
  );
  const excluded = config.items.filter(
    (item) => item.category !== config.countedCategory,
  );
  if (matching.length < 1 || excluded.length < 1) {
    throw new Error(
      "the fixture needs a linked row the condition counts and one it does not - with only counted rows, " +
        "a filter that was dropped and one that was applied give the same total",
    );
  }
  const totalAll = config.items.reduce((sum, item) => sum + item.amount, 0);
  const totalMatching = matching.reduce((sum, item) => sum + item.amount, 0);

  try {
    const itemTable = await createTable(baseId, {
      name: `${suffix}-items`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CATEGORY_FIELD, type: FieldType.SingleLineText },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.items.map((item) => ({
        fields: {
          [NAME_FIELD]: item.name,
          [CATEGORY_FIELD]: item.category,
          [AMOUNT_FIELD]: item.amount,
        },
      })),
    });
    itemTableId = itemTable.id;
    const categoryFieldId = itemTable.fields.find(
      (field: { name: string }) => field.name === CATEGORY_FIELD,
    )?.id;
    const amountFieldId = itemTable.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    if (!categoryFieldId || !amountFieldId) {
      throw new Error(`Item table ${itemTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    hostTableId = hostTable.id;
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: itemTableId,
        relationship: Relationship.OneMany,
      },
    });
    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: HOST_ROW,
            [LINK_FIELD]: itemTable.records.map((record: { id: string }) => ({
              id: record.id,
            })),
          },
        },
      ],
    });

    // The plain summary first, counting everything it is linked to.
    const rollupField = await createField(hostTableId, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: itemTableId,
        linkFieldId: linkField.id,
        lookupFieldId: amountFieldId,
      },
    });

    const readTotal = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      return {
        headers: response.headers,
        total: response.data.records[0]?.fields[ROLLUP_FIELD] ?? null,
      };
    };

    const settle = async (expected: number, what: string) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let seen: unknown = null;
      for (;;) {
        const current = await readTotal();
        seen = current.total;
        if (Number(seen) === expected) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `after ${config.settleTimeoutMs}ms ${what} reads ${JSON.stringify(seen)}, expected ${expected}`,
          );
        }
        await sleep(config.pollIntervalMs);
      }
    };

    // Fixture verification, outside the checkpoint: the summary counts every
    // linked row before the condition is added. Without it, a total that
    // happened to match could not be told from one that was never computed.
    const seeded = await settle(totalAll, "the summary before the condition");
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "rollup-condition-is-saved-and-applied",
      async () => {
        const updated = await convertField(hostTableId, rollupField.id, {
          name: ROLLUP_FIELD,
          type: FieldType.Rollup,
          options: { expression: "sum({values})" },
          lookupOptions: {
            foreignTableId: itemTableId,
            linkFieldId: linkField.id,
            lookupFieldId: amountFieldId,
            filter: {
              conjunction: "and",
              filterSet: [
                {
                  fieldId: categoryFieldId,
                  operator: "is",
                  value: config.countedCategory,
                },
              ],
            },
          },
        });

        if (!updated.lookupOptions?.filter) {
          throw new Error(
            `the condition was not saved: the field reads ${JSON.stringify(updated.lookupOptions ?? null)}`,
          );
        }

        // And the number. A build that stored the condition and ignored it in
        // the query would be the same wrong total with better metadata.
        await settle(totalMatching, "the summary after the condition");
        return { filter: updated.lookupOptions.filter };
      },
    );

    return {
      details: {
        itemTableId,
        hostTableId,
        routing,
        totalOfEverything: totalAll,
        totalOfCounted: totalMatching,
        savedFilter: probe.filter,
      },
    };
  } finally {
    for (const tableId of [hostTableId, itemTableId]) {
      if (!tableId) {
        continue;
      }
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
