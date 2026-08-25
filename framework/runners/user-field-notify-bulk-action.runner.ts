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
  duplicateRecord as apiDuplicateRecord,
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

// A second person assigned in a user field -> move that assignment without
// making it again (a CSV import into an existing table, duplicating the whole
// table, or copying one row) -> checkpoint: nothing lands in that person's
// notification list.
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
// The variants share everything but the operation itself, so they share a
// runner. Which one runs is `action`. Copying a single row is the smallest of
// them and arrived last (T6905): the earlier fix covered the bulk paths and
// left the one-row copy sending, which is the version a person meets by
// hand rather than through an import.

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
  // Notifications the assignee already had on the observed table before the
  // action ran. Only the one-row copy needs this: it observes the same table
  // the assignment was made on, so the legitimate "you were assigned" arrives
  // there too and would otherwise be counted as the copy's doing.
  const alreadyDelivered = new Set<string>();

  try {
    // A real signup rather than a row written into `users`: the assignee has
    // to be able to call the notification endpoint as themselves, and only a
    // real session can do that.
    //
    // The address carries the case's own prefix as well as the run id: the two
    // cases on this runner share a run, and a single address would make the
    // second one invite a collaborator the first had already added. That is a
    // 400, and it errored both columns of the first run this case ever had.
    const assigneeEmail = `${config.tableNamePrefix}-${context.runId}@example.com`;
    const assigneeAxios = await createNewUserAxios({
      email: assigneeEmail,
      password: "12345678a",
    });
    const assignee = (await assigneeAxios.get<IUserMeVo>(USER_ME)).data;
    try {
      await emailBaseInvitation({
        baseId,
        emailBaseInvitationRo: { emails: [assigneeEmail], role: Role.Editor },
      });
    } catch (error) {
      // Already a collaborator is the state this asks for, not a failure - a
      // re-run against a database an earlier run touched would hit it.
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exist/i.test(message)) {
        throw error;
      }
    }

    const listNotifications = async (tableId: string) => {
      const response = await assigneeAxios.get<INotificationVo>(
        NOTIFICATION_LIST,
        { params: { notifyStates: NotificationStatesEnum.Unread } },
      );
      return (response.data.notifications ?? []).filter(
        (notification: INotification) =>
          notification.url.includes(tableId) &&
          !alreadyDelivered.has(notification.id),
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
    } else if (config.action === "recordDuplicate") {
      // The row is assigned first, then copied. Copying one row is the
      // smallest version of the same move: the copy carries a user cell that
      // was already populated, and nobody is being assigned anything new.
      await assignOnCreate(subject, config.actionRowTitle);
      const sourceRows = await apiGetRecords(subject.tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 100,
      });
      const sourceRow = sourceRows.data.records.find((record) =>
        userIds(record.fields[subject.userFieldId]).includes(assignee.id),
      );
      if (!sourceRow) {
        throw new Error(
          `no row on ${subject.tableId} carries ${assignee.email} before the copy - there would be nothing to copy`,
        );
      }
      // The assignment just made is a real one and does notify. It lands on
      // this same table, so it is waited for and banked before the copy -
      // otherwise the copy would be blamed for it. Waiting also proves the
      // notification path reaches this table, not only the control one.
      const assignedDeadline = Date.now() + config.notifyTimeoutMs;
      for (;;) {
        const delivered = await listNotifications(subject.tableId);
        if (delivered.length > 0) {
          for (const notification of delivered) {
            alreadyDelivered.add(notification.id);
          }
          break;
        }
        if (Date.now() >= assignedDeadline) {
          throw new Error(
            `assigning ${assignee.email} on ${subject.tableId} produced no notification within ${config.notifyTimeoutMs}ms - ` +
              "the case could not tell the copy's silence from a table nothing reaches",
          );
        }
        await sleep(config.pollIntervalMs);
      }

      // Assignments to the same person are folded together for a short while,
      // so a copy made immediately after the assignment would have its
      // notification merged into the one just banked and disappear without
      // ever having been suppressed. Waiting out that window is what makes the
      // silence afterwards mean something. Copying immediately is green on
      // both columns, run 32855242590.
      if (config.coalescingWindowMs === undefined) {
        throw new Error(
          "the one-row copy needs a coalescingWindowMs: without waiting out the folding window, silence proves nothing",
        );
      }
      await sleep(config.coalescingWindowMs);

      const duplicated = await apiDuplicateRecord(
        subject.tableId,
        sourceRow.id,
      );
      actionRouting = assertServedByV2(duplicated.headers, {
        operation: "POST /table/{tableId}/record/{recordId}/duplicate",
        feature: "duplicateRecord",
      });
      if (!duplicated.data?.id) {
        throw new Error(
          `duplicating ${sourceRow.id} returned no row: ${JSON.stringify(duplicated.data)}`,
        );
      }
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
