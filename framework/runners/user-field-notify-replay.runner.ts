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
  emailBaseInvitation,
  getRecords as apiGetRecords,
  urlBuilder,
  CREATE_RECORD,
  DELETE_RECORDS_URL,
  NOTIFICATION_LIST,
  NOTIFICATION_READ_ALL,
  OPERATION_UNDO,
  UPDATE_RECORD,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2, pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserFieldNotifyReplayCaseConfig } from "../types";

// A record whose user field already names someone -> put that same assignment
// back by replaying the request that made it (undo a delete, undo a clearing
// edit) -> checkpoint: the person hears nothing the second time.
//
// The sibling runner user-field-notify-bulk-action covers the same rule for
// import and table duplicate (T6662). What T6663 changed is the shape of the
// rule: instead of naming the two paths that must stay quiet, only "a person
// is assigning you right now" notifies - user actions and form submissions -
// and everything else is silent by default, including source types nobody has
// written yet. Undo and redo needed a second guard, because a replay re-issues
// the original request: its source still reads 'user', and only the execution
// context says it is a replay.
//
// Every variant here is a SECOND delivery of an assignment the person already
// received a notification for. That is what makes the noise so hard to defend:
// not a stranger's notification, but the same one again, from an action they
// were not part of.
//
// Reading someone's mail rather than the table behind it: the assignee signs
// up for real and the observation is their own unread list, through the
// endpoint the bell icon calls.
//
// The control is the first assignment, on the table under test rather than a
// separate one - the record has to be assigned before it can be replayed, so
// the notification that create produces is free, and waiting for it proves
// both that notifications work on this commit and how long they take here.
// It is then marked read through the same public endpoint the bell icon's
// "mark all read" uses, which is what makes "no unread notification" mean
// "nothing new" rather than "nothing ever".
//
// Routing: FORCE_V2_ALL is on for the whole process, so every operation with a
// v2 path takes it, but only tagged controllers emit the feature header - the
// undo-redo controller does not. So the assertion is anchored on the
// assigned create, which every variant depends on and which is what publishes
// the event the projection listens to, and the action's own headers are
// recorded as data. What actually proves the action reached the projection is
// the pre-fix column going red.

const TITLE_FIELD = "Title";
const USER_FIELD = "Assignee";
const CONTROL_LATENCY_HEADROOM = 3;

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const assignedUserIds = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value])
    .filter(
      (entry): entry is { id?: string } =>
        typeof entry === "object" && entry !== null,
    )
    .map((entry) => entry.id)
    .filter((id): id is string => Boolean(id));

export const runUserFieldNotifyReplayCase = async (
  bugCase: BugCaseFor<"user-field-notify-replay">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserFieldNotifyReplayCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  // The undo stack is keyed by this, so every mutation and the undo that
  // replays it have to carry the same one; a missing id undoes nothing and the
  // case would be asserting against an empty stack.
  const windowId = `e2e-lab-notify-${context.runId}`;
  const windowHeaders = { "x-window-id": windowId };
  let tableId = "";

  try {
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
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exist/i.test(message)) {
        throw error;
      }
    }

    const unreadForTable = async () => {
      const response = await assigneeAxios.get<INotificationVo>(
        NOTIFICATION_LIST,
        { params: { notifyStates: NotificationStatesEnum.Unread } },
      );
      return (response.data.notifications ?? []).filter(
        (notification: INotification) => notification.url.includes(tableId),
      );
    };

    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: USER_FIELD,
          type: FieldType.User,
          // shouldNotify is what puts this field in the notifying set at all.
          options: { isMultiple: false, shouldNotify: true },
        },
      ],
    });
    tableId = table.id;
    const titleFieldId = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    )?.id;
    const userFieldId = table.fields.find(
      (field: { name: string }) => field.name === USER_FIELD,
    )?.id;
    if (!titleFieldId || !userFieldId) {
      throw new Error(`table ${tableId} was created without its fields`);
    }

    // ---- The first, legitimate assignment: also the control ---------------
    const createResponse = await axios.post(
      urlBuilder(CREATE_RECORD, { tableId }),
      {
        fieldKeyType: FieldKeyType.Id,
        records: [
          {
            fields: {
              [titleFieldId]: config.rowTitle,
              [userFieldId]: {
                id: assignee.id,
                title: assignee.name,
                email: assignee.email,
              },
            },
          },
        ],
      },
      { headers: windowHeaders },
    );
    const createRouting = assertServedByV2(createResponse.headers, {
      operation: "POST /table/{tableId}/record",
      feature: "createRecord",
    });
    const recordId = (
      createResponse.data as { records?: { id?: string }[] } | undefined
    )?.records?.[0]?.id;
    if (!recordId) {
      throw new Error(
        `the assigned row was not created: ${JSON.stringify(createResponse.data)}`,
      );
    }

    const controlStartedAt = Date.now();
    let controlLatencyMs = -1;
    while (Date.now() - controlStartedAt < config.notifyTimeoutMs) {
      if ((await unreadForTable()).length > 0) {
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

    // Read it, the way the person would. Everything the checkpoint sees after
    // this is new.
    await assigneeAxios.patch(NOTIFICATION_READ_ALL);
    const leftover = await unreadForTable();
    if (leftover.length > 0) {
      throw new Error(
        `${leftover.length} notification(s) are still unread after marking all read - ` +
          "the checkpoint would count the first assignment as if the replay had sent it",
      );
    }

    // ---- The replay -------------------------------------------------------
    const deleteRecord = async () => {
      const response = await axios.delete(
        urlBuilder(DELETE_RECORDS_URL, { tableId }),
        { headers: windowHeaders, params: { recordIds: [recordId] } },
      );
      assertServedByV2(response.headers, {
        operation: "DELETE /table/{tableId}/record",
        feature: "deleteRecord",
      });
    };
    const undoOnce = async () => {
      const response = await axios.post(
        urlBuilder(OPERATION_UNDO, { tableId }),
        {},
        { headers: windowHeaders, validateStatus: () => true },
      );
      const status = (response.data as { status?: string } | undefined)?.status;
      if (status !== "fulfilled") {
        throw new Error(
          `undo answered ${response.status} with status ${JSON.stringify(status)}, expected "fulfilled" - ` +
            "nothing was replayed, so this case would be asserting against an action that never happened",
        );
      }
      return pickRoutingHeaders(response.headers);
    };

    // Both variants replay onto the original row.
    const replayedRecordId = recordId;
    let actionRouting;

    if (config.replay === "undoDelete") {
      await deleteRecord();
      actionRouting = await undoOnce();
    } else {
      // undoClear: take the assignment away, then undo. The replay writes the
      // same person back through the update handler, where the event's source
      // still reads 'user' and only the execution context says it is a replay.
      const cleared = await axios.patch(
        urlBuilder(UPDATE_RECORD, { tableId, recordId }),
        {
          fieldKeyType: FieldKeyType.Id,
          record: { fields: { [userFieldId]: null } },
        },
        { headers: windowHeaders },
      );
      assertServedByV2(cleared.headers, {
        operation: "PATCH /table/{tableId}/record/{recordId}",
        feature: "updateRecord",
      });
      actionRouting = await undoOnce();
    }

    // Fixture verification, outside the checkpoint: the replay really did put
    // the assignment back. A replay that lost it could not have notified
    // anyone, and would pass on every commit.
    const rowDeadline = Date.now() + config.replaySettleTimeoutMs;
    for (;;) {
      const records = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 100,
      });
      const replayed = records.data.records.find(
        (record) => record.id === replayedRecordId,
      );
      if (
        replayed &&
        assignedUserIds(replayed.fields[userFieldId]).includes(assignee.id)
      ) {
        break;
      }
      if (Date.now() >= rowDeadline) {
        throw new Error(
          `row ${replayedRecordId} does not carry ${assignee.email} in "${USER_FIELD}" ${config.replaySettleTimeoutMs}ms after the ${config.replay} - ` +
            "the assignment was not replayed, so there is nothing here that could notify",
        );
      }
      await sleep(config.pollIntervalMs);
    }

    const quietStartedAt = Date.now();
    const probe = await bugCheckpoint(
      "replayed-assignment-notifies-nobody",
      async () => {
        for (;;) {
          const seen = await unreadForTable();
          if (seen.length > 0) {
            throw new Error(
              `${config.replay} sent ${assignee.email} ${seen.length} notification(s) ${Date.now() - quietStartedAt}ms after the request: ` +
                `${JSON.stringify(seen.map((notification) => notification.message))} - ` +
                "they were already assigned this and had already been told once",
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
        replay: config.replay,
        tableId,
        assigneeId: assignee.id,
        recordId,
        replayedRecordId,
        windowId,
        controlLatencyMs,
        createRouting,
        actionRouting,
        quietForMs: probe.quietForMs,
      },
    };
  } finally {
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
