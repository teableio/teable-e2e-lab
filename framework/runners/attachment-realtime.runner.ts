import { FieldKeyType, FieldType, IdPrefix } from "@teable/core";
import {
  getRecords as apiGetRecords,
  uploadAttachment as apiUploadAttachment,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { RealtimeSubscription } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AttachmentRealtimeCaseConfig } from "../types";

type RecordDoc = { fields?: Record<string, unknown> };

// A page with a row open -> attach a file to that row -> checkpoint: what the
// page is holding is a file it can actually show.
//
// An attachment cell holds a file's name and its address. The address is not
// stored with the file - it is worked out per reader, because it is temporary
// and signed. Whoever uploads the file gets it in the answer to their own
// upload; everyone else gets it from the message pushed to their page.
//
// That message carried the file without an address. So the row on everyone
// else's screen has an attachment in it that cannot be opened, downloaded or
// previewed: the name is there, the thumbnail is a blank, and the only way out
// is a reload. A colleague who says "I uploaded it" and a colleague who says
// "there is nothing there" are both right.
//
// The observation is the document the grid subscribes to. Reading the row over
// HTTP works out an address on the spot and shows nothing wrong.

const NAME_FIELD = "Name";
const FILE_FIELD = "File";

export const runAttachmentRealtimeCase = async (
  bugCase: BugCaseFor<"attachment-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AttachmentRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription: RealtimeSubscription<RecordDoc> | undefined;

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: FILE_FIELD, type: FieldType.Attachment },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    tableId = table.id;
    const recordId = table.records[0]?.id;
    const fileFieldId = table.fields.find(
      (field: { name: string }) => field.name === FILE_FIELD,
    )?.id;
    if (!recordId || !fileFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    client = realtimeClient(context.appUrl, context.cookie);
    subscription = await client.subscribe<RecordDoc>(
      `${IdPrefix.Record}_${tableId}`,
      recordId,
      { timeoutMs: config.subscribeTimeoutMs },
    );

    const seenFiles = () => {
      const raw = (subscription?.data()?.fields ?? {})[fileFieldId];
      return (Array.isArray(raw) ? raw : []) as {
        name?: string;
        presignedUrl?: unknown;
      }[];
    };

    // Fixture verification, outside the checkpoint: the page is holding the
    // row with an empty cell.
    await subscription.waitFor(() => seenFiles().length === 0, {
      timeoutMs: config.subscribeTimeoutMs,
      describe: "the row with nothing attached yet",
    });

    const probe = await bugCheckpoint(
      "an-attached-file-reaches-the-page-with-an-address",
      async () => {
        await apiUploadAttachment(
          tableId,
          recordId,
          fileFieldId,
          Buffer.from(config.fileContents, "utf8"),
          config.fileName,
        );

        const deadline = Date.now() + config.settleTimeoutMs;
        for (;;) {
          const failures = subscription!.errors();
          if (failures.length > 0) {
            throw new Error(
              `the watching page errored while the upload arrived: ${JSON.stringify(failures)}`,
            );
          }
          const files = seenFiles();
          const withAddress = files.filter(
            (file) =>
              typeof file.presignedUrl === "string" && file.presignedUrl !== "",
          );
          if (files.length > 0 && withAddress.length === files.length) {
            return { files: files.map((file) => file.name ?? null) };
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `after ${config.settleTimeoutMs}ms the page holds ${JSON.stringify(files)}` +
                (files.length === 0
                  ? " - the attachment never arrived at all"
                  : " - the attachment arrived without an address, so it cannot be opened, downloaded or " +
                    "previewed until the page is reloaded"),
            );
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }
      },
    );

    // Diagnostic, after the checkpoint: what a plain read answers, which works
    // out an address on the spot.
    const overHttp = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      take: 1,
    });
    const httpFiles = (overHttp.data.records[0]?.fields[fileFieldId] ?? []) as {
      presignedUrl?: unknown;
    }[];

    return {
      details: {
        tableId,
        filesOnThePage: probe.files,
        httpHasAddress: httpFiles.every(
          (file) => typeof file.presignedUrl === "string",
        ),
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
