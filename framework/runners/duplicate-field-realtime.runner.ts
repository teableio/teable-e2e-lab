import { FieldType, IdPrefix } from "@teable/core";
import { axios, DUPLICATE_FIELD, urlBuilder } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { RealtimeQuerySubscription } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DuplicateFieldRealtimeCaseConfig } from "../types";

// A page with the table open -> duplicate one of its columns -> checkpoint:
// the new column arrives on that page.
//
// Duplicating a column is how a column gets reshaped safely: make a copy,
// change the copy, delete the original. Everyone else with the table open -
// and the person's own second tab - has to be told the column exists, or they
// carry on working in a table that is missing it.
//
// Nothing was announced, so the copy was invisible until a reload. What that
// costs is not the reload: it is that the person who made the copy sees it and
// nobody else does, so two people describing the same table describe different
// tables.
//
// The observation is the list of columns the page subscribes to, not a read
// over HTTP - a read would fetch the copy from the database and show nothing
// wrong.

const NAME_FIELD = "Name";
const SOURCE_FIELD = "Amount";

export const runDuplicateFieldRealtimeCase = async (
  bugCase: BugCaseFor<"duplicate-field-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateFieldRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription: RealtimeQuerySubscription | undefined;

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SOURCE_FIELD, type: FieldType.Number },
      ],
      records: [
        { fields: { [NAME_FIELD]: config.rowTitle, [SOURCE_FIELD]: 1 } },
      ],
    });
    tableId = table.id;
    const sourceField = table.fields.find(
      (field: { name: string }) => field.name === SOURCE_FIELD,
    );
    if (!sourceField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    client = realtimeClient(context.appUrl, context.cookie);
    subscription = await client.subscribeQuery(
      `${IdPrefix.Field}_${tableId}`,
      {},
      { timeoutMs: config.subscribeTimeoutMs },
    );

    // Fixture verification, outside the checkpoint: the page is holding the
    // columns as they stand, and the copy is not among them.
    const before = subscription.ids();
    if (!before.includes(sourceField.id)) {
      throw new Error(
        `the page holds ${JSON.stringify(before)}, which does not include the column being copied - the ` +
          "fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-duplicated-column-arrives-on-the-open-page",
      async () => {
        const response = await axios.post(
          urlBuilder(DUPLICATE_FIELD, { tableId, fieldId: sourceField.id }),
          { name: config.copyName },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `duplicating the column answered ${response.status}: ${JSON.stringify(response.data)}`,
          );
        }
        const copyId = (response.data as { id?: string })?.id;
        if (!copyId) {
          throw new Error("duplicating the column returned no field");
        }

        try {
          await subscription!.waitFor((ids) => ids.includes(copyId), {
            timeoutMs: config.settleTimeoutMs,
            describe: `the copy ${config.copyName} on the open page`,
          });
        } catch (error) {
          throw new Error(
            `after ${config.settleTimeoutMs}ms the page holds ${JSON.stringify(subscription!.ids())}, which ` +
              `does not include the copy ${copyId} - whoever made the copy can see it and nobody else can ` +
              `(${error instanceof Error ? error.message : String(error)})`,
          );
        }
        return { copyId, idsAfter: subscription!.ids() };
      },
    );

    return {
      details: { tableId, copyId: probe.copyId, columnsAfter: probe.idsAfter },
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
