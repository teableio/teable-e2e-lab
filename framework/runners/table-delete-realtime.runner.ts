import { IdPrefix } from "@teable/core";
import {
  createTable,
  deleteTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { RealtimeQuerySubscription } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TableDeleteRealtimeCaseConfig } from "../types";

// A page with the base open -> delete one of its tables -> checkpoint: that
// table leaves the list the page is watching.
//
// Deleting a table is not only a change to the base; it is a change to what
// everyone currently looking at the base can still do. Anyone standing on that
// table - a colleague, or the person's own second tab - has to be told, or
// they are left on a page that no longer exists.
//
// Nothing was announced, so they stayed there. The sidebar refreshed, and the
// list of tables the page keeps subscribed still carried the deleted one, so
// every request that page made for records or views came back "not found",
// over and over, with nothing on screen saying why. The page is not broken in
// any way a person can describe: it is just a table that answers nothing.
//
// The observation is the list the page subscribes to, not a read over HTTP. A
// read asks the database and would correctly report the table gone; what
// nobody was told is the whole failure.

export const runTableDeleteRealtimeCase = async (
  bugCase: BugCaseFor<"table-delete-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TableDeleteRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription: RealtimeQuerySubscription | undefined;
  let deletedTableId = "";
  let keptTableId = "";

  try {
    const deletedTable = await createTable(baseId, {
      name: `${suffix}-deleted`,
      records: [],
    });
    deletedTableId = deletedTable.id;
    // A second table nobody touches: a list that dropped the deleted table and
    // a list that dropped everything are otherwise the same answer.
    const keptTable = await createTable(baseId, {
      name: `${suffix}-kept`,
      records: [],
    });
    keptTableId = keptTable.id;

    client = realtimeClient(context.appUrl, context.cookie);
    subscription = await client.subscribeQuery(
      `${IdPrefix.Table}_${baseId}`,
      {},
    );

    // Fixture verification, outside the checkpoint: the page is really
    // watching both tables before either is deleted. Without this the
    // checkpoint could pass over a subscription that never carried the table
    // at all.
    await subscription.waitFor(
      (ids) => ids.includes(deletedTableId) && ids.includes(keptTableId),
      {
        timeoutMs: config.settleTimeoutMs,
        describe: "the watched list of tables carries both fixture tables",
      },
    );

    const probe = await bugCheckpoint(
      "deleting-a-table-reaches-the-open-page",
      async () => {
        // The ordinary delete - the one the menu offers, which moves the table
        // to the trash - rather than the permanent one, because that is what a
        // person standing on the page has just had happen to them.
        await deleteTable(baseId, deletedTableId);

        await subscription!.waitFor((ids) => !ids.includes(deletedTableId), {
          timeoutMs: config.announceTimeoutMs,
          describe:
            "the deleted table leaves the list the open page is watching",
        });
        const ids = subscription!.ids();
        if (!ids.includes(keptTableId)) {
          throw new Error(
            `the page lost the table that was not deleted too: it now watches [${ids.join(", ")}]`,
          );
        }
        const errors = subscription!.errors();
        if (errors.length > 0) {
          throw new Error(
            `the page's subscription reported ${errors.length} failures: ${JSON.stringify(errors)}`,
          );
        }
        return { ids };
      },
    );

    return {
      details: {
        baseId,
        deletedTableId,
        keptTableId,
        watchedAfterDelete: probe.ids,
      },
    };
  } finally {
    subscription?.close();
    client?.close();
    for (const tableId of [deletedTableId, keptTableId]) {
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
