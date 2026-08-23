import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecords as apiUpdateRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ConditionalRollupPropagationCaseConfig } from "../types";

// A rollup that sums only the rows matching a condition -> change one of the
// rows it counts -> checkpoint: the total follows.
//
// "Total of the electronics only", "hours booked against this client",
// "invoices still unpaid" - a rollup with a condition is how a summary column
// narrows what it counts. Changing a value it counts has to move it.
//
// The propagation that decides which summaries a write dirties skipped the
// filtered path, so the total kept its old number. Nothing failed: the write
// answered 200, the source row shows the new value, and the summary beside it
// disagrees until something unrelated forces a recompute.
//
// The case also changes a row the condition excludes and records what happens.
// That is not asserted - whether an excluded row should cost a recompute is
// the optimization's own question, not this one - but it is worth having in
// the artifact next to the number that matters.

const NAME_FIELD = "Name";
const CATEGORY_FIELD = "Category";
const PRICE_FIELD = "Price";
const TOTAL_FIELD = "Matching Total";
const REPORT_ROW = "the-report";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runConditionalRollupPropagationCase = async (
  bugCase: BugCaseFor<"conditional-rollup-propagation">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalRollupPropagationCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let sourceTableId = "";
  let reportTableId = "";

  const matching = config.rows.filter(
    (row) => row.category === config.matchedCategory,
  );
  const excluded = config.rows.filter(
    (row) => row.category !== config.matchedCategory,
  );
  if (matching.length < 1 || excluded.length < 1) {
    throw new Error(
      "the fixture needs at least one row the condition counts and one it does not - a rollup that counted " +
        "everything would move for the wrong reason",
    );
  }
  const initialTotal = matching.reduce((sum, row) => sum + row.price, 0);
  const editedTotal = initialTotal - matching[0].price + config.editedPrice;
  if (editedTotal === initialTotal) {
    throw new Error(
      "the edited price gives the same total - the case could not tell a summary that followed the change " +
        "from one that ignored it",
    );
  }

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CATEGORY_FIELD, type: FieldType.SingleLineText },
        { name: PRICE_FIELD, type: FieldType.Number },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [CATEGORY_FIELD]: row.category,
          [PRICE_FIELD]: row.price,
        },
      })),
    });
    sourceTableId = sourceTable.id;
    const categoryFieldId = sourceTable.fields.find(
      (field: { name: string }) => field.name === CATEGORY_FIELD,
    )?.id;
    const priceFieldId = sourceTable.fields.find(
      (field: { name: string }) => field.name === PRICE_FIELD,
    )?.id;
    if (!categoryFieldId || !priceFieldId) {
      throw new Error(`Source table ${sourceTableId} is not in place`);
    }

    const reportTable = await createTable(baseId, {
      name: `${suffix}-report`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: REPORT_ROW } }],
    });
    reportTableId = reportTable.id;

    // The summary column: sum the price of the rows in one category, with no
    // link between the tables - the condition is the whole relationship.
    await createField(reportTableId, {
      name: TOTAL_FIELD,
      type: FieldType.Number,
      isLookup: true,
      isConditionalLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: priceFieldId,
        rollupExpression: "sum({values})",
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: categoryFieldId,
              operator: "is",
              value: config.matchedCategory,
            },
          ],
        },
      },
    });

    const readTotal = async () => {
      const response = await apiGetRecords(reportTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      return {
        headers: response.headers,
        total: response.data.records[0]?.fields[TOTAL_FIELD] ?? null,
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

    // Fixture verification, outside the checkpoint: the summary counted the
    // right rows to begin with. A total that was wrong from the start would
    // make "it did not follow the change" describe something else.
    const seeded = await settle(initialTotal, "the summary before any change");
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const sourceRows = await apiGetRecords(sourceTableId, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rows.length,
    });
    const idByName = new Map(
      sourceRows.data.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD] ?? ""),
          record.id,
        ],
      ),
    );

    const probe = await bugCheckpoint(
      "conditional-summary-follows-a-counted-row",
      async () => {
        await apiUpdateRecords(sourceTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: [
            {
              id: idByName.get(matching[0].name) as string,
              fields: { [PRICE_FIELD]: config.editedPrice },
            },
          ],
        });
        await settle(editedTotal, "the summary after the change");
        return { total: editedTotal };
      },
    );

    // Recorded, not asserted: what an excluded row costs. Whether changing a
    // row the condition ignores should move anything is the optimization's
    // question, not this case's.
    await apiUpdateRecords(sourceTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          id: idByName.get(excluded[0].name) as string,
          fields: { [PRICE_FIELD]: config.editedPrice },
        },
      ],
    });
    await sleep(config.pollIntervalMs * 4);
    const afterExcluded = await readTotal();

    return {
      details: {
        sourceTableId,
        reportTableId,
        routing,
        initialTotal,
        totalAfterCountedChange: probe.total,
        totalAfterExcludedChange: afterExcluded.total,
      },
    };
  } finally {
    for (const tableId of [reportTableId, sourceTableId]) {
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
