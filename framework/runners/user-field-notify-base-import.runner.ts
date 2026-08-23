import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INotification } from "@teable/core";
import {
  FieldKeyType,
  FieldType,
  NotificationStatesEnum,
  Role,
} from "@teable/core";
import type { INotificationVo, IUserMeVo } from "@teable/openapi";
import {
  axios,
  exportBase as apiExportBase,
  getSignature as apiGetSignature,
  getRecords as apiGetRecords,
  importBase as apiImportBase,
  emailBaseInvitation,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  NOTIFICATION_LIST,
  UploadType,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import {
  createBase,
  createRecords,
  createSpace,
  createTable,
  deleteSpace,
  getFields,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserFieldNotifyBaseImportCaseConfig } from "../types";

// A second person assigned in a user field, in a base that is then exported
// and imported back -> checkpoint: nothing lands in that person's
// notification list.
//
// This is the third path named in T6662 and the one no case covered: the
// issue's title says "CSV / base import and table duplicate", and the CSV and
// duplicate halves ship as `user-field/import-does-not-notify-assignee` and
// `user-field/table-duplicate-does-not-notify-assignee`.
//
// Importing a base is the largest of the three. It rebuilds every table in the
// file, so every user cell in every table arrives populated at once - a base
// with a few hundred assigned rows is a few hundred notifications and the
// matching pile of email, for assignments that were made long ago in the base
// this file came out of. Nobody assigned anyone anything; a copy of the base
// arrived.
//
// The shared design - a real second session, a control assignment that
// measures how long a notification takes on this commit, and a quiet budget
// refused unless it clears that latency by a wide margin - is described in
// `user-field/import-does-not-notify-assignee`. It is repeated here rather
// than shared with that runner because everything around it differs: this case
// works on its own space and its own bases, not on the seed base.

const TITLE_FIELD = "Title";
const USER_FIELD = "Assignee";
const CONTROL_LATENCY_HEADROOM = 3;

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const userIds = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .filter(
      (entry): entry is { id?: string } =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => entry.id)
    .filter((id): id is string => Boolean(id));

export const runUserFieldNotifyBaseImportCase = async (
  bugCase: BugCaseFor<"user-field-notify-base-import">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserFieldNotifyBaseImportCaseConfig = bugCase.config;
  const suffix = `${config.namePrefix}-${context.runId}`;
  const zipPath = join(tmpdir(), `e2e-lab-base-import-${context.runId}.zip`);
  let spaceId = "";

  try {
    // Its own space: importing a base creates one, and the seed base's space
    // is shared with every other case in the run.
    const space = await createSpace({ name: suffix });
    spaceId = space.id;
    const sourceBase = await createBase({ spaceId, name: `${suffix}-source` });

    // A real signup rather than a row written into `users`: the assignee has
    // to call the notification endpoint as themselves, and only a real
    // session can do that.
    const assigneeEmail = `${config.namePrefix}-${context.runId}@example.com`;
    const assigneeAxios = await createNewUserAxios({
      email: assigneeEmail,
      password: "12345678a",
    });
    const assignee = (await assigneeAxios.get<IUserMeVo>(USER_ME)).data;
    await emailBaseInvitation({
      baseId: sourceBase.id,
      emailBaseInvitationRo: { emails: [assigneeEmail], role: Role.Editor },
    });

    const listNotifications = async (tableId: string) => {
      const response = await assigneeAxios.get<INotificationVo>(
        NOTIFICATION_LIST,
        { params: { notifyStates: NotificationStatesEnum.Unread } },
      );
      return (response.data.notifications ?? []).filter(
        (notification: INotification) => notification.url.includes(tableId),
      );
    };

    const createAssigneeTable = async (baseId: string, name: string) => {
      const table = await createTable(baseId, {
        name,
        fields: [
          {
            name: TITLE_FIELD,
            type: FieldType.SingleLineText,
            isPrimary: true,
          },
          {
            name: USER_FIELD,
            type: FieldType.User,
            // shouldNotify is what puts this field in the notifying set at
            // all; without it neither side of the fix would ever send.
            options: { isMultiple: false, shouldNotify: true },
          },
        ],
      });
      const titleFieldId = table.fields.find(
        (field: { name: string }) => field.name === TITLE_FIELD,
      )?.id;
      const userFieldId = table.fields.find(
        (field: { name: string }) => field.name === USER_FIELD,
      )?.id;
      if (!titleFieldId || !userFieldId) {
        throw new Error(`table ${table.id} was created without its fields`);
      }
      return { tableId: table.id, titleFieldId, userFieldId };
    };

    const assignOnCreate = async (
      target: { tableId: string; titleFieldId: string; userFieldId: string },
      title: string,
    ) =>
      createRecords(target.tableId, {
        fieldKeyType: FieldKeyType.Id,
        records: [
          {
            fields: {
              [target.titleFieldId]: title,
              [target.userFieldId]: {
                id: assignee.id,
                title: assignee.name,
                email: assignee.email,
              },
            },
          },
        ],
      });

    // ---- Control, outside the checkpoint --------------------------------
    // A table in the source base, so its notification is told apart from the
    // imported copy's by table id and nothing else. It is also the row that
    // gets carried into the export, which is what makes the imported copy
    // carry an assignment at all.
    const subject = await createAssigneeTable(
      sourceBase.id,
      `${suffix}-subject`,
    );
    await assignOnCreate(subject, config.rowTitle);

    const controlStartedAt = Date.now();
    let controlLatencyMs = -1;
    while (Date.now() - controlStartedAt < config.notifyTimeoutMs) {
      if ((await listNotifications(subject.tableId)).length > 0) {
        controlLatencyMs = Date.now() - controlStartedAt;
        break;
      }
      await sleep(config.pollIntervalMs);
    }
    if (controlLatencyMs < 0) {
      throw new Error(
        `assigning ${assignee.email} on a plain record create produced no notification within ${config.notifyTimeoutMs}ms - ` +
          "user-field notifications are not working here at all, so this case cannot tell silence from a broken pipeline",
      );
    }
    const requiredQuietMs = controlLatencyMs * CONTROL_LATENCY_HEADROOM;
    if (config.quietTimeoutMs < requiredQuietMs) {
      throw new Error(
        `a real notification took ${controlLatencyMs}ms here, and the quiet budget is only ${config.quietTimeoutMs}ms - ` +
          `it needs at least ${requiredQuietMs}ms of headroom, or "nothing arrived" would just mean "not yet"`,
      );
    }

    // ---- Export the base, then import it back ---------------------------
    const exported = await apiExportBase(sourceBase.id, { includeData: true });
    const previewUrl = (exported.data as unknown as { previewUrl?: string })
      ?.previewUrl;
    if (!previewUrl) {
      throw new Error(
        `exporting ${sourceBase.id} returned no file: ${JSON.stringify(exported.data)}`,
      );
    }
    const downloaded = await axios.get<ArrayBuffer>(previewUrl, {
      responseType: "arraybuffer",
      baseURL: "",
    });
    const zip = Buffer.from(downloaded.data);
    if (zip.byteLength === 0) {
      throw new Error("the exported base file is empty");
    }
    await writeFile(zipPath, zip);

    const signature = await apiGetSignature(
      {
        type: UploadType.Import,
        contentLength: zip.byteLength,
        contentType: "application/zip",
      },
      undefined,
    );
    await apiUploadFile(
      signature.data.token,
      createReadStream(zipPath),
      signature.data.requestHeaders,
    );
    const notified = await apiNotify(
      signature.data.token,
      undefined,
      `e2e-lab-base-import-${context.runId}.zip`,
    );

    // The assignee's list is cleared of the control before the import, so
    // anything found afterwards can only have come from the import itself.
    const beforeImport = await listNotifications(subject.tableId);
    if (beforeImport.length === 0) {
      throw new Error(
        "the control notification is gone from the list before the import - the observation is not in place",
      );
    }

    const imported = await apiImportBase({
      notify: notified.data,
      spaceId,
    });
    const importedBaseId = imported.data?.base?.id;
    const importedTableId = imported.data?.tableIdMap?.[subject.tableId];
    if (!importedBaseId || !importedTableId) {
      throw new Error(
        `importing the base produced no copy of ${subject.tableId}: ${JSON.stringify(imported.data)}`,
      );
    }

    // Fixture verification, outside the checkpoint: the imported copy really
    // carries the assignment. Without it "nobody was notified" could just as
    // well mean "nobody was assigned", which every commit would pass.
    const importedFields = await getFields(importedTableId);
    const importedUserFieldId = importedFields.find(
      (field: { name: string }) => field.name === USER_FIELD,
    )?.id;
    if (!importedUserFieldId) {
      throw new Error(
        `the imported table ${importedTableId} has no "${USER_FIELD}" field`,
      );
    }
    const rowDeadline = Date.now() + config.rowVisibleTimeoutMs;
    let assignedRow: { id: string } | undefined;
    for (;;) {
      const records = await apiGetRecords(importedTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 100,
      });
      assignedRow = records.data.records.find(
        (record) =>
          record.fields[importedUserFieldId] !== undefined &&
          userIds(record.fields[importedUserFieldId]).includes(assignee.id),
      );
      if (assignedRow) {
        break;
      }
      if (Date.now() >= rowDeadline) {
        throw new Error(
          `no row on the imported table ${importedTableId} carries ${assignee.email} after ${config.rowVisibleTimeoutMs}ms - ` +
            "the import did not carry the assignment, so there is nothing here that could notify",
        );
      }
      await sleep(config.pollIntervalMs);
    }

    const quietStartedAt = Date.now();
    const probe = await bugCheckpoint(
      "base-import-notifies-nobody",
      async () => {
        let seen: INotification[] = [];
        for (;;) {
          seen = await listNotifications(importedTableId);
          if (seen.length > 0) {
            throw new Error(
              `importing a base sent ${assignee.email} ${seen.length} notification(s) ${Date.now() - quietStartedAt}ms after the request: ` +
                `${JSON.stringify(seen.map((notification) => notification.message))} - ` +
                "nobody assigned them anything, a copy of the base arrived",
            );
          }
          if (Date.now() - quietStartedAt >= config.quietTimeoutMs) {
            return { quietForMs: Date.now() - quietStartedAt };
          }
          await sleep(config.pollIntervalMs);
        }
      },
    );

    return {
      details: {
        spaceId,
        sourceBaseId: sourceBase.id,
        subjectTableId: subject.tableId,
        importedBaseId,
        importedTableId,
        assigneeId: assignee.id,
        controlLatencyMs,
        exportedBytes: zip.byteLength,
        assignedRecordId: assignedRow.id,
        quietForMs: probe.quietForMs,
      },
    };
  } finally {
    await unlink(zipPath).catch(() => undefined);
    if (spaceId) {
      try {
        // Trashing first is not optional: a permanent delete is a no-op on a
        // space that was never trashed, and the bases would be left behind.
        await deleteSpace(spaceId);
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
