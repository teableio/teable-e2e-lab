import { FieldType, IdPrefix, SortFunc, ViewType } from "@teable/core";
import { manualSortView as apiManualSortView } from "@teable/openapi";
import {
  createTable,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ManualSortRealtimeCaseConfig } from "../types";

// A client watching a view's rows -> sort that view by a column ->
// checkpoint: the watching client is pushed the new order.
//
// Sorting a grid rewrites the view's own row order, which the product does
// with raw SQL for speed. Nothing then told the subscribers, so the rows in
// front of whoever clicked sort did not move: the click looked dead. And the
// socket's cached answer for that view kept its pre-sort order, so a refresh
// served the stale order back over the correct one the page had rendered.
//
// The observation is a live query, not a document. The grid subscribes to a
// view's rows that way, and the failure is precisely that nothing is pushed -
// a case watching a single document would have nothing to notice.
//
// The plain read is checked afterwards as well. The two together are what the
// user experiences: the page updates, and it still agrees with the server the
// next time anyone asks.

const TITLE_FIELD = "Title";
const ORDER_FIELD = "Rank";

export const runManualSortRealtimeCase = async (
  bugCase: BugCaseFor<"manual-sort-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ManualSortRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription:
    | Awaited<ReturnType<ReturnType<typeof realtimeClient>["subscribeQuery"]>>
    | undefined;

  const ranks = config.rowRanks;
  if (ranks.length < 3) {
    throw new Error(
      "three rows at least: with two, a sort that reversed them and a sort that did nothing to a " +
        "coincidentally-ordered pair are hard to tell apart",
    );
  }
  const sortedRanks = [...ranks].sort((left, right) => left - right);
  if (sortedRanks.join(",") === ranks.join(",")) {
    throw new Error(
      "the rows are already in ascending rank order - sorting them would be a no-op and the case would " +
        "pass without anything being pushed",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: ORDER_FIELD, type: FieldType.Number },
      ],
      views: [{ type: ViewType.Grid, name: "grid" }],
      records: ranks.map((rank, index) => ({
        fields: { [TITLE_FIELD]: `row-${index}`, [ORDER_FIELD]: rank },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const rankFieldId = table.fields.find(
      (field: { name: string }) => field.name === ORDER_FIELD,
    )?.id;
    if (!viewId || !rankFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const idByRank = new Map(
      table.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          Number(record.fields[ORDER_FIELD]),
          record.id,
        ],
      ),
    );
    const expectedIds = sortedRanks.map((rank) => idByRank.get(rank) as string);
    const seededIds = ranks.map((rank) => idByRank.get(rank) as string);

    client = realtimeClient(context.appUrl, context.cookie);
    // The same subscription the grid opens: the view id rides along, so the
    // result order follows that view's own row order rather than the table's.
    subscription = await client.subscribeQuery(
      `${IdPrefix.Record}_${tableId}`,
      { viewId, type: IdPrefix.Record },
      { timeoutMs: config.subscribeTimeoutMs },
    );

    // Fixture verification, outside the checkpoint: the client is attached and
    // holds the rows in their seeded order. Failing to subscribe is a broken
    // case, and starting from the sorted order would make the assertion
    // unfalsifiable.
    await subscription.waitFor((ids) => ids.length === ranks.length, {
      timeoutMs: config.subscribeTimeoutMs,
      describe: "the rows it subscribed to",
    });
    if (subscription.ids().join(",") !== seededIds.join(",")) {
      throw new Error(
        `the client starts with ${JSON.stringify(subscription.ids())}, expected the seeded order ` +
          `${JSON.stringify(seededIds)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "manual-sort-reaches-the-open-page",
      async () => {
        await apiManualSortView(tableId, viewId, {
          sortObjs: [{ fieldId: rankFieldId, order: SortFunc.Asc }],
        });

        await subscription!.waitFor(
          (ids) => ids.join(",") === expectedIds.join(","),
          {
            timeoutMs: config.settleTimeoutMs,
            describe: "the order it was just sorted into",
          },
        );

        // And the next plain read agrees. A push that arrived while the cached
        // answer stayed stale would put the page and the server back out of step
        // on the next refresh, which is the other half of the report.
        const records = await getRecords(tableId, {
          viewId,
          take: ranks.length,
        });
        const readIds = records.records.map(
          (record: { id: string }) => record.id,
        );
        if (readIds.join(",") !== expectedIds.join(",")) {
          throw new Error(
            `the client was pushed the sorted order but reading the view returns ${JSON.stringify(readIds)}, ` +
              `expected ${JSON.stringify(expectedIds)}`,
          );
        }
        return { pushed: subscription!.ids(), read: readIds };
      },
    );

    return {
      details: {
        tableId,
        viewId,
        seededOrder: seededIds,
        expectedOrder: expectedIds,
        pushedOrder: probe.pushed,
        readOrder: probe.read,
      },
    };
  } finally {
    subscription?.close();
    client?.close();
    if (tableId) {
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
