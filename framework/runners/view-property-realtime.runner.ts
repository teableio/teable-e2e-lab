import { IdPrefix, SortFunc } from "@teable/core";
import { axios, urlBuilder, VIEW_GROUP, VIEW_SORT } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { realtimeClient } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ViewPropertyRealtimeCaseConfig } from "../types";

// A client subscribed to a view -> change that view's group, then its sort ->
// checkpoint: the subscriber sees both.
//
// The write persisted correctly, and an op WAS pushed - but it only updated
// the document's `query`, never the top-level `group` / `sort` the client
// actually reads (the shape the HTTP VO uses). So the subscriber received a
// change it could not act on, the grid kept its old layout, and the user had
// to reload: "changing group or sort needs a refresh".
//
// That distinction is why this case waits on `group` rather than on any op
// arriving at all. A case that only asserted "something was published" would
// have been green on both sides of the fix.
//
// It is the same failure mode as the filter case, on two more projections, and
// it is worth its own case for the same reason the fix touched two files: the
// group and sort projections are separate code paths, and a regression in
// either one is invisible to a case that only watches the other.

const TITLE_FIELD = "Name";
const NUMBER_FIELD = "Amount";

export const runViewPropertyRealtimeCase = async (
  bugCase: BugCaseFor<"view-property-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ViewPropertyRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: TITLE_FIELD, type: "singleLineText" },
        { name: NUMBER_FIELD, type: "number" },
      ],
      records: config.rowTitles.map((title, index) => ({
        fields: { [TITLE_FIELD]: title, [NUMBER_FIELD]: index + 1 },
      })),
    });
    tableId = table.id;
    const titleField = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    );
    const numberField = table.fields.find(
      (field: { name: string }) => field.name === NUMBER_FIELD,
    );
    const viewId = table.views?.[0]?.id;
    if (!titleField || !numberField || !viewId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: a client attaches, and the
    // view starts with neither a group nor a sort. Both are premises - the
    // case is about the transition away from "none", and a subscription that
    // never attached would make any later silence meaningless.
    client = realtimeClient(context.appUrl, context.cookie);
    const view = await client.subscribe<{ group?: unknown; sort?: unknown }>(
      `${IdPrefix.View}_${tableId}`,
      viewId,
      { timeoutMs: config.subscribeTimeoutMs },
    );
    const initial = view.data();
    if (initial?.group != null || initial?.sort != null) {
      throw new Error(
        `the fresh view already carries group=${JSON.stringify(initial?.group)} sort=${JSON.stringify(initial?.sort)} - the fixture is not in place`,
      );
    }

    const put = async (route: string, body: unknown) => {
      // Raw axios so the routing headers survive the call.
      const response = await axios.put(
        urlBuilder(route, { tableId, viewId }),
        body,
        { validateStatus: () => true },
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(
          `${route} answered ${response.status}: ${JSON.stringify(response.data)}`,
        );
      }
      return response;
    };

    const expectedGroup = [{ fieldId: titleField.id, order: SortFunc.Asc }];
    const expectedSort = {
      sortObjs: [{ fieldId: numberField.id, order: SortFunc.Desc }],
    };
    const matches = (actual: unknown, expected: unknown) =>
      JSON.stringify(actual) === JSON.stringify(expected);

    const probe = await bugCheckpoint(
      "subscribed-client-sees-group-and-sort-changes",
      async () => {
        const groupResponse = await put(VIEW_GROUP, {
          group: expectedGroup,
        });
        // The engine belongs to the request under test, and this request is
        // the trigger inside the checkpoint - so a v1 answer reads as a
        // reproduction rather than as a harness error. Conservative direction:
        // never a false green.
        const groupRouting = assertServedByV2(groupResponse.headers, {
          operation: "PUT /table/{tableId}/view/{viewId}/group",
          feature: "updateViewGroup",
        });
        await view.waitFor((data) => matches(data?.group, expectedGroup), {
          timeoutMs: config.settleTimeoutMs,
          describe: `the exact group it was just given: ${JSON.stringify(expectedGroup)}`,
        });

        // Sort is a separate projection, so a fix to one does not imply the
        // other. Both were reported and both are checked.
        const sortResponse = await put(VIEW_SORT, {
          sort: expectedSort,
        });
        const sortRouting = assertServedByV2(sortResponse.headers, {
          operation: "PUT /table/{tableId}/view/{viewId}/sort",
          feature: "updateViewSort",
        });
        await view.waitFor((data) => matches(data?.sort, expectedSort), {
          timeoutMs: config.settleTimeoutMs,
          describe: `the exact sort it was just given: ${JSON.stringify(expectedSort)}`,
        });

        const failures = view.errors();
        if (failures.length > 0) {
          throw new Error(
            `the subscribed client errored during the view property changes: ${JSON.stringify(failures)}`,
          );
        }
        const current = view.data();
        if (
          !matches(current?.group, expectedGroup) ||
          !matches(current?.sort, expectedSort)
        ) {
          throw new Error(
            `the subscribed client has group=${JSON.stringify(current?.group)} sort=${JSON.stringify(current?.sort)}, expected group=${JSON.stringify(expectedGroup)} sort=${JSON.stringify(expectedSort)}`,
          );
        }
        return {
          group: current.group,
          sort: current.sort,
          groupRouting,
          sortRouting,
        };
      },
    );

    return {
      details: {
        tableId,
        viewId,
        groupRouting: probe.groupRouting,
        sortRouting: probe.sortRouting,
        groupAfter: probe.group,
        sortAfter: probe.sort,
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
