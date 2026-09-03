import { FieldType } from "@teable/core";
import {
  axios,
  enableShareView as apiEnableShareView,
  getViewList as apiGetViewList,
  updateViewShareMeta as apiUpdateViewShareMeta,
  DUPLICATE_TABLE,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DuplicateSharedViewCaseConfig } from "../types";

// A table with a view someone has shared -> duplicate the table ->
// checkpoint: the copy is created, and its view carries a share id of its own.
//
// Sharing a view mints a credential that is unique across the whole instance -
// it is the address of a public page. Duplicating the table copied every view
// as it was, that credential included, and the insert then met the unique
// index on it. The duplicate answered 500 and no copy was made: one shared
// view anywhere in a table made the whole table impossible to duplicate, with
// nothing in the message about sharing.
//
// The assertion is not only that the request succeeds. A copy whose view
// carried the same share id would be worse than the 500 - two tables answering
// on one public address, where turning off sharing on either takes down a page
// the other one is serving - so the ids are compared.
//
// The second question this runner asks (`assert: "copyIsNotShared"`) is what
// the copy should carry INSTEAD, and it is not "a link of its own": nothing.
// Duplicating a table is not a decision to publish one, and a copy that comes
// out already shared - under the source's password and edit rules, with no
// prompt and nothing in the interface saying so - publishes a table nobody
// chose to publish. The source's own link is checked too, because "the copy is
// not shared" must not have been reached by unsharing both.

const NAME_FIELD = "Name";

export const runDuplicateSharedViewCase = async (
  bugCase: BugCaseFor<"duplicate-shared-view">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateSharedViewCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    createdTableIds.unshift(table.id);
    const viewId = table.views?.[0]?.id;
    if (!viewId) {
      throw new Error(`Table ${table.id} has no view`);
    }

    const shared = await apiEnableShareView({ tableId: table.id, viewId });
    const sourceShareId = shared.data?.shareId;
    if (!sourceShareId) {
      throw new Error(
        `enabling sharing on ${viewId} returned no share id: ${JSON.stringify(shared.data)}`,
      );
    }

    // The share rules a person set on the source. They matter to the second
    // question: a copy that inherits these is reachable with the source's
    // password by anyone who ever had it.
    if (config.shareMeta) {
      await apiUpdateViewShareMeta(table.id, viewId, config.shareMeta);
      const sourceViews = await apiGetViewList(table.id);
      const sourceView = sourceViews.data.find(
        (view: { id: string }) => view.id === viewId,
      ) as { shareMeta?: Record<string, unknown> } | undefined;
      if (!sourceView?.shareMeta?.password) {
        throw new Error(
          `the share rules did not stick on the source view: ${JSON.stringify(sourceView?.shareMeta)}`,
        );
      }
    }

    // Raw axios with the status open: before the fix this request is refused,
    // and the generated client drops the response - routing headers included -
    // the moment it is.
    const response = await axios.post(
      urlBuilder(DUPLICATE_TABLE, { baseId, tableId: table.id }),
      { name: `${suffix}-copy`, includeRecords: true },
      { validateStatus: () => true },
    );
    const status = response.status;
    const body =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data ?? "");
    const copyId = (response.data as { id?: string })?.id;
    if (copyId) {
      createdTableIds.unshift(copyId);
    }

    const probe = await bugCheckpoint(
      "duplicating-a-table-with-a-shared-view",
      async () => {
        if (status < 200 || status >= 300) {
          throw new Error(
            `duplicating a table whose view is shared answered ${status}: ${body}`,
          );
        }
        if (!copyId) {
          throw new Error(
            `the duplicate answered ${status} but returned no table: ${body}`,
          );
        }
        const routing = assertServedByV2(response.headers, {
          operation: "POST /base/{baseId}/table/{tableId}/duplicate",
          feature: "duplicateTable",
        });

        const copiedViews = await apiGetViewList(copyId);
        const copiedShareIds = copiedViews.data.map(
          (view: { id: string; shareId?: string | null }) =>
            view.shareId ?? null,
        );

        if (config.assert === "copyIsNotShared") {
          // Nothing published. Each of the three is a separate way the copy can
          // be reachable: the switch, the address, and the rules behind it.
          for (const view of copiedViews.data as {
            id: string;
            name?: string;
            enableShare?: boolean | null;
            shareId?: string | null;
            shareMeta?: Record<string, unknown> | null;
          }[]) {
            if (view.enableShare || view.shareId || view.shareMeta) {
              throw new Error(
                `the copied view ${view.name ?? view.id} came out shared: ` +
                  JSON.stringify({
                    enableShare: view.enableShare,
                    shareId: view.shareId,
                    shareMeta: view.shareMeta,
                  }),
              );
            }
          }

          // And the source keeps its own link - otherwise "the copy is not
          // shared" could have been reached by unsharing everything.
          const sourceViews = await apiGetViewList(table.id);
          const sourceView = sourceViews.data.find(
            (view: { id: string }) => view.id === viewId,
          ) as { enableShare?: boolean; shareId?: string } | undefined;
          if (
            !sourceView?.enableShare ||
            sourceView.shareId !== sourceShareId
          ) {
            throw new Error(
              `duplicating took the source's own link with it: ${JSON.stringify(sourceView)}`,
            );
          }
          return { routing, copiedShareIds };
        }

        // The copy's own share credential. Reusing the source's would put two
        // tables on one public address - a success that is worse than the
        // failure it replaced.
        if (copiedShareIds.includes(sourceShareId)) {
          throw new Error(
            `the copied table's views carry ${JSON.stringify(copiedShareIds)}, which includes the source's ` +
              `share id ${sourceShareId} - both tables would answer on one public address`,
          );
        }
        return { routing, copiedShareIds };
      },
    );

    return {
      details: {
        tableId: table.id,
        copyId,
        sourceShareId,
        duplicateStatus: status,
        copiedShareIds: probe.copiedShareIds,
        routing: probe.routing,
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
