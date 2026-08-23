import { FieldKeyType, FieldType, IdPrefix } from "@teable/core";
import { updateRecords as apiUpdateRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { RealtimeSubscription } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { MultiFieldUpdateRealtimeCaseConfig } from "../types";

// A client watching a row -> change several of its cells in one edit ->
// checkpoint: the watcher sees all of them.
//
// Changing several cells at once is ordinary: a paste across a row, a form
// submission, an automation setting a status and a date together. The change
// goes out to everyone looking at that row, and it went out as one message per
// cell - of which only some survived. What the other people saw was a row
// half-updated, indistinguishable from a row that was only half-edited.
//
// The observation is the document the grid subscribes to, because that is what
// the other people are looking at. Reading the row over HTTP afterwards would
// show all the values and prove nothing: the row in the database was always
// right.

type RecordDoc = { fields?: Record<string, unknown> };

const NAME_FIELD = "Name";

export const runMultiFieldUpdateRealtimeCase = async (
  bugCase: BugCaseFor<"multi-field-update-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: MultiFieldUpdateRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription: RealtimeSubscription<RecordDoc> | undefined;

  if (config.cellCount < 3) {
    throw new Error(
      "at least three cells - with two, losing one and applying them in a different order are hard to " +
        "tell apart",
    );
  }

  const cellNames = Array.from(
    { length: config.cellCount },
    (_, index) => `Cell ${index + 1}`,
  );
  const before = (index: number) => `${config.beforePrefix}-${index + 1}`;
  const after = (index: number) => `${config.afterPrefix}-${index + 1}`;

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        ...cellNames.map((name) => ({
          name,
          type: FieldType.SingleLineText,
        })),
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "the-row",
            ...Object.fromEntries(
              cellNames.map((name, index) => [name, before(index)]),
            ),
          },
        },
      ],
    });
    tableId = table.id;
    const recordId = table.records[0]?.id;
    const fieldIdByName = new Map<string, string>(
      table.fields.map((field: { id: string; name: string }) => [
        field.name,
        field.id,
      ]),
    );
    if (!recordId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    client = realtimeClient(context.appUrl, context.cookie);
    subscription = await client.subscribe<RecordDoc>(
      `${IdPrefix.Record}_${tableId}`,
      recordId,
      {
        timeoutMs: config.subscribeTimeoutMs,
      },
    );

    const seenValues = () => {
      const fields = subscription?.data()?.fields ?? {};
      return cellNames.map((name) =>
        String(fields[fieldIdByName.get(name) as string] ?? ""),
      );
    };

    // Fixture verification, outside the checkpoint: the watcher is attached
    // and holds the row as it stands. Starting from the new values would make
    // the assertion unfalsifiable.
    await subscription.waitFor(
      () =>
        seenValues().join("|") ===
        cellNames.map((_, index) => before(index)).join("|"),
      {
        timeoutMs: config.subscribeTimeoutMs,
        describe: "the row as it stands before the edit",
      },
    );

    const expected = cellNames.map((_, index) => after(index)).join("|");

    const probe = await bugCheckpoint(
      "one-edit-of-several-cells-reaches-the-watcher",
      async () => {
        // One request changing every cell: that is the shape whose changes
        // were sent one at a time and partly lost.
        await apiUpdateRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: [
            {
              id: recordId,
              fields: Object.fromEntries(
                cellNames.map((name, index) => [name, after(index)]),
              ),
            },
          ],
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let seen: string[] = [];
        for (;;) {
          const failures = subscription!.errors();
          if (failures.length > 0) {
            throw new Error(
              `the watching client errored while the edit arrived: ${JSON.stringify(failures)}`,
            );
          }
          seen = seenValues();
          if (seen.join("|") === expected) {
            return { seen };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }

        const stale = seen.filter(
          (value, index) => value !== after(index),
        ).length;
        throw new Error(
          `after ${config.settleTimeoutMs}ms the watching client holds ${JSON.stringify(seen)}, expected ` +
            `${JSON.stringify(cellNames.map((_, index) => after(index)))} - ${stale} of ${config.cellCount} ` +
            "cells never arrived, so the row in front of everyone else is half-updated",
        );
      },
    );

    return {
      details: {
        tableId,
        recordId,
        cells: config.cellCount,
        seenAfterEdit: probe.seen,
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
