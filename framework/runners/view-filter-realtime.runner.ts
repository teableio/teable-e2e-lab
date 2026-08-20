import { IdPrefix } from "@teable/core";
import { axios, urlBuilder, VIEW_FILTER } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { realtimeClient } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ViewFilterRealtimeCaseConfig } from "../types";

// A client subscribed to a view -> set and clear that view's filter ->
// checkpoint: the client applies every update and never errors.
//
// Updating the filter on a view that has no persisted filter emitted an event
// whose previous value was `undefined`. The realtime projection forwarded it,
// and the op it produced carried a path and nothing else once JSON
// serialized - `{ p: [...] }` with no instruction. ot-json0 refuses that, so
// every subscribed client threw `invalid / missing instruction in op`. The
// user saw a Socket Error toast on entering or filtering the table, and the
// filter appeared not to apply.
//
// Nothing about that reaches the HTTP response: the PUT answers 200 either
// way. The damage is entirely in what the server pushed afterwards, which is
// why this case subscribes as a client rather than reading the view back.
//
// The sequence matters. The first update is a CLEAR on a fresh view - the
// undefined-previous-value shape that produced the bad op. The set and the
// second clear follow, because a fix that only special-cased the first case
// would leave the others broken and this case should notice.

const TITLE_FIELD = "Name";

export const runViewFilterRealtimeCase = async (
  bugCase: BugCaseFor<"view-filter-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ViewFilterRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [{ name: TITLE_FIELD, type: "singleLineText" }],
      records: [{ fields: { [TITLE_FIELD]: config.rowTitle } }],
    });
    tableId = table.id;
    const titleField = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    );
    const viewId = table.views?.[0]?.id;
    if (!titleField || !viewId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: a client can actually
    // subscribe to this view, and the view starts with no filter. Both are
    // premises - the bug is about the update from "no filter", and a
    // subscription that never attached would make any later silence
    // meaningless.
    client = realtimeClient(context.appUrl, context.cookie);
    const view = await client.subscribe<{ filter?: unknown }>(
      `${IdPrefix.View}_${tableId}`,
      viewId,
      { timeoutMs: config.subscribeTimeoutMs },
    );
    if (view.data()?.filter != null) {
      throw new Error(
        `the fresh view already carries a filter (${JSON.stringify(view.data()?.filter)}) - the fixture is not in place`,
      );
    }
    const subscription = view;

    const setFilter = async (filter: unknown) => {
      // Raw axios so the routing headers survive: the generated client keeps
      // the status but drops the response.
      const response = await axios.put(
        urlBuilder(VIEW_FILTER, { tableId, viewId }),
        { filter },
        { validateStatus: () => true },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `updating the view filter answered ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }
      return response;
    };

    const routing = assertServedByV2((await setFilter(null)).headers, {
      operation: "PUT /table/{tableId}/view/{viewId}/filter",
      feature: "updateViewFilter",
    });

    const probe = await bugCheckpoint(
      "subscribed-client-applies-every-filter-update",
      async () => {
        // The clear above already happened - it is the shape that broke, and
        // its damage shows up on the subscriber, so check for it before doing
        // anything else.
        const afterFirstClear = subscription.errors();
        if (afterFirstClear.length > 0) {
          throw new Error(
            `clearing a filter that was never set broke the subscribed client: ${JSON.stringify(afterFirstClear)}`,
          );
        }

        const filter = {
          conjunction: "and",
          filterSet: [
            {
              fieldId: titleField.id,
              operator: "is",
              value: config.rowTitle,
            },
          ],
        };
        await setFilter(filter);
        await subscription.waitFor((data) => data?.filter != null, {
          timeoutMs: config.settleTimeoutMs,
          describe: "the filter it was just given",
        });

        await setFilter(null);
        await subscription.waitFor(
          (data) => data !== undefined && data.filter == null,
          {
            timeoutMs: config.settleTimeoutMs,
            describe: "the filter being cleared again",
          },
        );

        const failures = subscription.errors();
        if (failures.length > 0) {
          throw new Error(
            `the subscribed client errored during the filter round trip: ${JSON.stringify(failures)}`,
          );
        }
        return { filterAfter: subscription.data()?.filter };
      },
    );

    return {
      details: {
        tableId,
        viewId,
        routing,
        filterAfter: probe.filterAfter,
      },
    };
  } finally {
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
