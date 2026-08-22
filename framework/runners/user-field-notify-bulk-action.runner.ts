import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INotification } from "@teable/core";
import {
  FieldKeyType,
  FieldType,
  NotificationStatesEnum,
  Relationship,
  Role,
} from "@teable/core";
import type { INotificationVo, IUserMeVo } from "@teable/openapi";
import {
  analyzeFile as apiAnalyzeFile,
  duplicateTable as apiDuplicateTable,
  emailBaseInvitation,
  getRecords as apiGetRecords,
  getSignature as apiGetSignature,
  inplaceImportTableFromFile as apiInplaceImportTableFromFile,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  NOTIFICATION_LIST,
  SUPPORTEDTYPE,
  UploadType,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import {
  createField,
  createRecords,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserFieldNotifyBulkActionCaseConfig } from "../types";

// A second person assigned in a user field -> move that assignment in bulk
// (CSV import into an existing table, or duplicating the whole table) ->
// checkpoint: nothing lands in that person's notification list.
//
// A user-field notification means "someone just put you on this". v1 only
// ever sent it for that. v2 sent it for any record whose user cell arrived
// populated, and bulk data movement arrives that way by definition: importing
// a sheet that already names people, or duplicating a table with its rows,
// re-delivers every assignment in it. A table of a few hundred rows is a few
// hundred notifications and the matching pile of email, for an assignment the
// person already had and nobody just made. The fix reads the create's source
// and stays silent for these paths (T6662).
//
// Observation is the assignee's own notification list, through the public
// endpoint the bell icon calls, on a real second session. Reading the table
// behind it would prove the row exists; it would not prove the person is
// looking at it.
//
// Silence is the assertion, so it has to be silence rather than slowness.
// Every run first assigns the same person on a throwaway CONTROL table and
// waits for that notification to arrive, which establishes two things: the
// notification path is alive on this commit at all, and how long it takes
// here. If the quiet budget is not comfortably longer than the control took,
// the case refuses to run rather than report a green it has not earned.
//
// The two variants share everything but the bulk operation itself, so they
// share a runner. Which one runs is `action`.

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

export const runUserFieldNotifyBulkActionCase = async (
  bugCase: BugCaseFor<"user-field-notify-bulk-action">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserFieldNotifyBulkActionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const csvPath = join(tmpdir(), `e2e-lab-notify-${context.runId}.csv`);
  const createdTableIds: string[] = [];
  let foreignTableId = "";

  try {
    // A real signup rather than a row written into `users`: the assignee has
    // to be able to call the notification endpoint as themselves, and only a
    // real session can do that.
    const assigneeEmail = `e2e-lab-notify-${context.runId}@example.com`;
    const assigneeAxios = await createNewUserAxios({
      email: assigneeEmail,
      password: "12345678a",
    });
    const assignee = (await assigneeAxios.get<IUserMeVo>(USER_ME)).data;
    await emailBaseInvitation({
      baseId,
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

    const createAssigneeTable = async (name: string) => {
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
      createdTableIds.unshift(table.id);
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

    // ---- Control, outside the checkpoint -------------------------------
    // Its own table, so the notification it produces can never be confused
    // with one from the action under test - the two are told apart by the
    // table id in the notification's url and nothing else.
    const control = await createAssigneeTable(`${suffix}-control`);
    await assignOnCreate(control, config.controlRowTitle);

    const controlStartedAt = Date.now();
    let controlLatencyMs = -1;
    while (Date.now() - controlStartedAt < config.notifyTimeoutMs) {
      if ((await listNotifications(control.tableId)).length > 0) {
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

    // ---- The bulk action ------------------------------------------------
    const subject = await createAssigneeTable(`${suffix}-subject`);
    let observedTableId = subject.tableId;
    let observedUserFieldId = subject.userFieldId;
    let actionRouting;

    if (config.action === "import") {
      // The sheet names the person by email, the way an exported table does.
      const csv = `${TITLE_FIELD},${USER_FIELD}\n${config.actionRowTitle},${assigneeEmail}\n`;
      await writeFile(csvPath, csv, "utf8");
      const signature = await apiGetSignature(
        {
          type: UploadType.Import,
          contentLength: Buffer.byteLength(csv),
          contentType: "text/csv",
        },
        undefined,
      );
      await apiUploadFile(
        signature.data.token,
        createReadStream(csvPath),
        signature.data.requestHeaders,
      );
      const notified = await apiNotify(
        signature.data.token,
        undefined,
        `e2e-lab-notify-${context.runId}.csv`,
      );
      const attachmentUrl = notified.data.presignedUrl;
      if (!attachmentUrl) {
        throw new Error("the uploaded sheet has no presigned URL");
      }
      // The sheet key comes from the analyzer rather than a constant lifted
      // out of the product: this runner has to keep parsing on commits either
      // side of the fix, and the public preview call is the stable way to ask.
      const analyzed = await apiAnalyzeFile({
        attachmentUrl,
        fileType: SUPPORTEDTYPE.CSV,
      });
      const worksheetKey = Object.keys(analyzed.data.worksheets)[0];
      if (!worksheetKey) {
        throw new Error("the analyzer found no worksheet in the uploaded CSV");
      }

      const imported = await apiInplaceImportTableFromFile(
        baseId,
        subject.tableId,
        {
          attachmentUrl,
          fileType: SUPPORTEDTYPE.CSV,
          insertConfig: {
            sourceWorkSheetKey: worksheetKey,
            excludeFirstRow: true,
            sourceColumnMap: {
              [subject.titleFieldId]: 0,
              [subject.userFieldId]: 1,
            },
          },
        },
      );
      actionRouting = assertServedByV2(imported.headers, {
        operation: "PATCH /import/{baseId}/{tableId}",
        feature: "importRecords",
      });
    } else {
      // A two-way oneMany link hosts its foreign key on the other table, which
      // the duplicate's physical row-copy plan cannot map. Without it the copy
      // never republishes the user cell, the notification never fires on
      // either side of the fix, and this case would be green for a reason that
      // has nothing to do with T6662.
      const foreignTable = await createTable(baseId, {
        name: `${suffix}-foreign`,
        fields: [
          { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
        ],
      });
      foreignTableId = foreignTable.id;
      await createField(subject.tableId, {
        name: "LinkToForeign",
        type: FieldType.Link,
        options: {
          foreignTableId: foreignTable.id,
          relationship: Relationship.OneMany,
        },
      });

      await assignOnCreate(subject, config.actionRowTitle);

      const duplicated = await apiDuplicateTable(baseId, subject.tableId, {
        name: `${suffix}-copy`,
        includeRecords: true,
      });
      actionRouting = assertServedByV2(duplicated.headers, {
        operation: "POST /base/{baseId}/table/{tableId}/duplicate",
        feature: "duplicateTable",
      });
      const duplicatedTableId = duplicated.data?.id;
      if (!duplicatedTableId) {
        throw new Error(
          `duplicating ${subject.tableId} returned no table: ${JSON.stringify(duplicated.data)}`,
        );
      }
      createdTableIds.unshift(duplicatedTableId);
      // Field ids are remapped in the copy, so they are resolved by name.
      const copiedFields = await getFields(duplicatedTableId);
      const copiedUserFieldId = copiedFields.find(
        (field: { name: string }) => field.name === USER_FIELD,
      )?.id;
      if (!copiedUserFieldId) {
        throw new Error(
          `the duplicated table ${duplicatedTableId} has no "${USER_FIELD}" field`,
        );
      }
      observedTableId = duplicatedTableId;
      observedUserFieldId = copiedUserFieldId;
    }

    // Fixture verification, outside the checkpoint: the assignment actually
    // arrived on the observed table. Without it "nobody was notified" could
    // just as well mean "nobody was assigned", which every commit would pass.
    const rowDeadline = Date.now() + config.rowVisibleTimeoutMs;
    let assignedRow: { id: string } | undefined;
    for (;;) {
      const records = await apiGetRecords(observedTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 100,
      });
      assignedRow = records.data.records.find(
        (record) =>
          record.fields[observedUserFieldId] !== undefined &&
          userIds(record.fields[observedUserFieldId]).includes(assignee.id),
      );
      if (assignedRow) {
        break;
      }
      if (Date.now() >= rowDeadline) {
        throw new Error(
          `no row on ${observedTableId} carries ${assignee.email} in "${USER_FIELD}" after ${config.rowVisibleTimeoutMs}ms - ` +
            `the ${config.action} did not move the assignment, so there is nothing here that could notify`,
        );
      }
      await sleep(config.pollIntervalMs);
    }

    // The bulk action's own notifications, if any, are scheduled after its
    // response, so the clock starts here.
    const quietStartedAt = Date.now();
    const probe = await bugCheckpoint(
      "bulk-assignment-move-notifies-nobody",
      async () => {
        let seen: INotification[] = [];
        for (;;) {
          seen = await listNotifications(observedTableId);
          if (seen.length > 0) {
            throw new Error(
              `${config.action} sent ${assignee.email} ${seen.length} notification(s) ${Date.now() - quietStartedAt}ms after the request: ` +
                `${JSON.stringify(seen.map((notification) => notification.message))} - ` +
                "nobody assigned them anything, the assignment was only copied",
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
        action: config.action,
        assigneeId: assignee.id,
        controlTableId: control.tableId,
        controlLatencyMs,
        subjectTableId: subject.tableId,
        observedTableId,
        actionRowTitle: config.actionRowTitle,
        assignedRecordId: assignedRow.id,
        actionRouting,
        quietForMs: probe.quietForMs,
      },
    };
  } finally {
    await unlink(csvPath).catch(() => undefined);
    // The foreign table hosts the link's foreign key, so it goes before the
    // tables whose __fk columns point at it.
    for (const tableId of [foreignTableId, ...createdTableIds]) {
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
