import { Colors, FieldKeyType, FieldType, IdPrefix } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { RealtimeSubscription } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SelectOptionRemovalRealtimeCaseConfig } from "../types";

type RecordDoc = { fields?: Record<string, unknown> };

// A status column with a choice nobody should use any more -> remove that
// choice from the column -> checkpoint: the rows that held it go empty on the
// screen of whoever is watching.
//
// Retiring a choice is ordinary housekeeping: a status that no longer applies,
// a category that was merged into another. The rows that held it are supposed
// to empty out.
//
// Nothing was pushed for those rows, so on every open screen they went on
// showing a status the column no longer offers. It cannot be filtered for -
// the choice is gone from the filter list - and it cannot be selected again.
// The row reads as having a status that does not exist, until someone reloads.
//
// The observation is the document the grid subscribes to. Reading the rows
// over HTTP afterwards shows the cleared cell and proves nothing.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";

export const runSelectOptionRemovalRealtimeCase = async (
  bugCase: BugCaseFor<"select-option-removal-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SelectOptionRemovalRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;
  let retiredSubscription: RealtimeSubscription<RecordDoc> | undefined;
  let keptSubscription: RealtimeSubscription<RecordDoc> | undefined;

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [
              { name: config.retiredChoice, color: Colors.Red },
              { name: config.keptChoice, color: Colors.Green },
            ],
          },
        },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.retiredRowTitle,
            [STATUS_FIELD]: config.retiredChoice,
          },
        },
        {
          fields: {
            [NAME_FIELD]: config.keptRowTitle,
            [STATUS_FIELD]: config.keptChoice,
          },
        },
      ],
    });
    tableId = table.id;
    const statusField = table.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    );
    const retiredRecordId = table.records[0]?.id;
    const keptRecordId = table.records[1]?.id;
    if (!statusField?.id || !retiredRecordId || !keptRecordId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    client = realtimeClient(context.appUrl, context.cookie);
    const collection = `${IdPrefix.Record}_${tableId}`;
    retiredSubscription = await client.subscribe<RecordDoc>(
      collection,
      retiredRecordId,
      { timeoutMs: config.subscribeTimeoutMs },
    );
    keptSubscription = await client.subscribe<RecordDoc>(
      collection,
      keptRecordId,
      { timeoutMs: config.subscribeTimeoutMs },
    );

    const seen = (subscription: RealtimeSubscription<RecordDoc>) =>
      (subscription.data()?.fields ?? {})[statusField.id] ?? null;

    // Fixture verification, outside the checkpoint: both watchers hold the row
    // with its status. A cell that was already empty would make the assertion
    // unfalsifiable.
    await retiredSubscription.waitFor(
      () =>
        seen(retiredSubscription as RealtimeSubscription<RecordDoc>) ===
        config.retiredChoice,
      {
        timeoutMs: config.subscribeTimeoutMs,
        describe: `the row showing ${config.retiredChoice}`,
      },
    );
    await keptSubscription.waitFor(
      () =>
        seen(keptSubscription as RealtimeSubscription<RecordDoc>) ===
        config.keptChoice,
      {
        timeoutMs: config.subscribeTimeoutMs,
        describe: `the row showing ${config.keptChoice}`,
      },
    );

    const probe = await bugCheckpoint(
      "retiring-a-choice-empties-the-rows-that-held-it",
      async () => {
        // Remove the choice from the column, leaving the other one.
        await convertField(tableId, statusField.id, {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [{ name: config.keptChoice, color: Colors.Green }],
          },
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        for (;;) {
          const failures = [
            ...retiredSubscription!.errors(),
            ...keptSubscription!.errors(),
          ];
          if (failures.length > 0) {
            throw new Error(
              `a watching client errored while the change arrived: ${JSON.stringify(failures)}`,
            );
          }
          if (seen(retiredSubscription!) === null) {
            break;
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `after ${config.settleTimeoutMs}ms the watching client still shows ` +
                `${JSON.stringify(seen(retiredSubscription!))} on ${config.retiredRowTitle} - a status the ` +
                "column no longer offers, which cannot be filtered for or chosen again",
            );
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }

        // The other half: the row holding the surviving choice must not be
        // cleared with it.
        if (seen(keptSubscription!) !== config.keptChoice) {
          throw new Error(
            `removing ${config.retiredChoice} also cleared ${config.keptRowTitle}, which held ` +
              `${config.keptChoice}`,
          );
        }
        return { keptStillShows: seen(keptSubscription!) };
      },
    );

    // Diagnostic, after the checkpoint: what the rows read over HTTP.
    const settled = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: 2,
    });

    return {
      details: {
        tableId,
        keptStillShows: probe.keptStillShows,
        overHttp: settled.data.records.map(
          (record: { fields: Record<string, unknown> }) => ({
            name: record.fields[NAME_FIELD] ?? null,
            status: record.fields[STATUS_FIELD] ?? null,
          }),
        ),
      },
    };
  } finally {
    retiredSubscription?.close();
    keptSubscription?.close();
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
