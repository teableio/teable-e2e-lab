import { FieldKeyType, FieldType, IdPrefix } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRowCount as apiGetRowCount,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { chunk } from "../chunk";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { WideWindowSocketLoadCaseConfig } from "../types";

// A table with enough rows that the page asks for all of them at once -> open
// it -> checkpoint: the rows arrive.
//
// A page does not fetch its rows one by one. It subscribes, is told which rows
// are in the answer, and then asks for all of them in a single request that
// carries every id. Past a certain number of rows, that request was assembled
// as a query string and stopped fitting: the server refused it for oversized
// headers before it reached any handler, and the page sat there with a
// subscription and no rows.
//
// Nothing about it is gradual. Under the limit everything works; over it the
// table is empty for everybody, and which side of the line a table falls on
// depends on how many rows it happens to hold.
//
// The observation is the socket, not the HTTP endpoint, and deliberately: the
// endpoint itself changed shape in the fix, so asking it directly would be
// asking two different questions of the two sides. What a person's page does -
// subscribe, then receive rows - is the same request on both.

const NAME_FIELD = "Name";

export const runWideWindowSocketLoadCase = async (
  bugCase: BugCaseFor<"wide-window-socket-load">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: WideWindowSocketLoadCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription:
    | Awaited<ReturnType<ReturnType<typeof realtimeClient>["subscribeQuery"]>>
    | undefined;

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const nameFieldId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id;
    if (!viewId || !nameFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const rowTitles = Array.from(
      { length: config.recordCount },
      (_, index) => `row-${index}`,
    );
    const createdIds: string[] = [];
    for (const batch of chunk(rowTitles, config.writeBatchSize)) {
      const written = await apiCreateRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        records: batch.map((title) => ({
          fields: { [nameFieldId]: title },
        })),
      });
      createdIds.push(
        ...written.data.records.map((record: { id: string }) => record.id),
      );
    }

    // Fixture verification, outside the checkpoint. Two things, both about the
    // fixture rather than the product: every row landed, and the single
    // request the page will cause is genuinely big enough to have been refused
    // - measured from the ids themselves rather than assumed, because a build
    // with shorter ids would put the same row count on the other side of the
    // limit and the case would quietly be about nothing.
    const counted = await apiGetRowCount(tableId, { viewId });
    if (counted.data.rowCount !== config.recordCount) {
      throw new Error(
        `the table holds ${counted.data.rowCount} rows, expected ${config.recordCount} - the fixture is not in place`,
      );
    }
    const asQueryStringBytes = createdIds.reduce(
      (sum, id) => sum + `ids[]=${id}&`.length,
      0,
    );
    if (asQueryStringBytes <= config.headerLimitBytes) {
      throw new Error(
        `the ids for ${config.recordCount} rows come to ${asQueryStringBytes} bytes as a query string, which fits ` +
          `inside the ${config.headerLimitBytes}-byte header limit - this fixture cannot produce the refusal it is about`,
      );
    }

    client = realtimeClient(context.appUrl, context.cookie);

    const probe = await bugCheckpoint(
      "a-page-opened-on-a-long-table-is-given-its-rows",
      async () => {
        // What a page does when somebody opens the table.
        subscription = await client!.subscribeQuery(
          `${IdPrefix.Record}_${tableId}`,
          { viewId, type: IdPrefix.Record },
          { timeoutMs: config.subscribeTimeoutMs },
        );
        await subscription.waitFor((ids) => ids.length === config.recordCount, {
          timeoutMs: config.subscribeTimeoutMs,
          describe: `all ${config.recordCount} rows of the table`,
        });
        const failures = subscription.errors();
        if (failures.length > 0) {
          throw new Error(
            `the page is subscribed and the server answered with ${JSON.stringify(failures)} - the rows never arrive`,
          );
        }
        return { rows: subscription.ids().length };
      },
    );

    return {
      details: {
        tableId,
        recordCount: config.recordCount,
        idsAsQueryStringBytes: asQueryStringBytes,
        headerLimitBytes: config.headerLimitBytes,
        rowsThePageReceived: probe.rows,
      },
    };
  } finally {
    try {
      subscription?.close();
    } catch {
      // Tearing down a subscription is housekeeping, not a result.
    }
    try {
      client?.close();
    } catch {
      // Same.
    }
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
