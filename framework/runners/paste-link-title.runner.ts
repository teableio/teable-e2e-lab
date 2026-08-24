import { FieldKeyType, FieldType, IdPrefix, Relationship } from "@teable/core";
import { axios, PASTE_URL, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { RealtimeSubscription } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { PasteLinkTitleCaseConfig } from "../types";

type RecordDoc = { fields?: Record<string, unknown> };

// Copy a link cell, paste it into the row below, and watch the row from
// another screen -> checkpoint: the pasted cell arrives with the name of the
// record it points at.
//
// Copying a link cell down a column is how a link gets filled in for a batch
// of rows. The copy carries the record's name along with its id, and the paste
// dropped the name and kept the id. What the person who pasted sees is right;
// what everyone else watching that table sees is a column of "Untitled" until
// they reload.
//
// So the cost is not the pasted row - it is that two people looking at the
// same table disagree about it, and only one of them has a reason to doubt
// what they see.
//
// The observation is the document the grid subscribes to. Reading the row over
// HTTP afterwards fills the name in from the database and shows nothing.

const NAME_FIELD = "Name";
const LINK_FIELD = "Order";

export const runPasteLinkTitleCase = async (
  bugCase: BugCaseFor<"paste-link-title">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PasteLinkTitleCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription: RealtimeSubscription<RecordDoc> | undefined;

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.foreignRowTitle } }],
    });
    createdTableIds.unshift(foreign.id);
    const foreignRecordId = foreign.records[0]?.id;

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [NAME_FIELD]: config.sourceRowTitle } },
        { fields: { [NAME_FIELD]: config.targetRowTitle } },
      ],
    });
    createdTableIds.unshift(host.id);
    const viewId = host.views?.[0]?.id;
    const targetRecordId = host.records[1]?.id;
    if (!foreignRecordId || !viewId || !targetRecordId) {
      throw new Error("the fixture tables are not in place");
    }

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });
    const fields = [...host.fields, linkField];
    const linkColumnIndex = fields.findIndex(
      (field: { id: string }) => field.id === linkField.id,
    );
    if (linkColumnIndex < 0) {
      throw new Error(`${LINK_FIELD} is not on ${host.id}`);
    }

    client = realtimeClient(context.appUrl, context.cookie);
    subscription = await client.subscribe<RecordDoc>(
      `${IdPrefix.Record}_${host.id}`,
      targetRecordId,
      { timeoutMs: config.subscribeTimeoutMs },
    );

    // A link cell reads back as one object or as a list of them depending on
    // how the write came in, so both shapes are flattened before looking for
    // the name (run 32678584833, where the pasted cell arrived as a list).
    const seenLink = () => {
      const raw = (subscription?.data()?.fields ?? {})[linkField.id];
      if (raw === undefined || raw === null) return undefined;
      const entries = (Array.isArray(raw) ? raw : [raw]) as {
        id?: string;
        title?: unknown;
      }[];
      return entries[0];
    };
    const seenRaw = () => (subscription?.data()?.fields ?? {})[linkField.id];

    // Fixture verification, outside the checkpoint: the watching client holds
    // the row with the cell still empty. Starting from a filled cell would
    // make the assertion unfalsifiable.
    await subscription.waitFor(() => seenRaw() === undefined, {
      timeoutMs: config.subscribeTimeoutMs,
      describe: "the row with its link cell still empty",
    });

    const probe = await bugCheckpoint(
      "a-pasted-link-arrives-with-its-name",
      async () => {
        // The clipboard the grid writes when a link cell is copied: the
        // record's id and the name it is called by.
        // PATCH, not POST: the paste endpoint answers 404 to a POST, which
        // reads as "the bug" and is really the case addressing the wrong verb
        // (run 32678300431).
        const response = await axios.patch(
          urlBuilder(PASTE_URL, { tableId: host.id }),
          {
            viewId,
            ranges: [
              [linkColumnIndex, 1],
              [linkColumnIndex, 1],
            ],
            content: [[{ id: foreignRecordId, title: config.foreignRowTitle }]],
            header: [linkField],
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `pasting the link cell answered ${response.status}: ${JSON.stringify(response.data)}`,
          );
        }

        const deadline = Date.now() + config.settleTimeoutMs;
        let seen = seenLink();
        for (;;) {
          const failures = subscription!.errors();
          if (failures.length > 0) {
            throw new Error(
              `the watching client errored while the paste arrived: ${JSON.stringify(failures)}`,
            );
          }
          seen = seenLink();
          if (seen?.title === config.foreignRowTitle) {
            return { seen };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }

        throw new Error(
          `after ${config.settleTimeoutMs}ms the watching client holds ${JSON.stringify(seenRaw() ?? null)} in ` +
            `${LINK_FIELD}, expected the name ${JSON.stringify(config.foreignRowTitle)}` +
            (seen?.id === foreignRecordId
              ? " - the right record, with nothing to call it by, so the column reads Untitled to everyone " +
                "except whoever pasted"
              : ""),
        );
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        targetRecordId,
        seenAfterPaste: probe.seen,
      },
    };
  } finally {
    subscription?.close();
    client?.close();
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
