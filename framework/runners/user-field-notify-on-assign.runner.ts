import type { INotification } from "@teable/core";
import {
  FieldKeyType,
  FieldType,
  NotificationStatesEnum,
  Role,
} from "@teable/core";
import type { INotificationVo, IUserMeVo } from "@teable/openapi";
import {
  createRecords as apiCreateRecords,
  emailBaseInvitation,
  NOTIFICATION_LIST,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserFieldNotifyOnAssignCaseConfig } from "../types";

// Assign someone in a member column -> checkpoint: they are told.
//
// Being told is the whole point of a member column. Someone puts your name in
// a row and you find out: that is how work is handed over in a base, and it is
// what people rely on instead of sending a message.
//
// Nothing was sent. The row says the work is yours and you have no idea, so
// the handover happens in a chat message anyway, or not at all - and the
// column that was supposed to carry it looks like it is working, because the
// name is right there in the cell.
//
// The sibling cases in this repository assert the opposite for particular
// paths: an import, a table duplicate or an undo must NOT notify anyone. They
// all take the notification produced by an ordinary assignment for granted as
// their control. This case is that control on its own, so the two halves of
// the rule are each held down by something.
//
// The assignee signs up for real and the observation is their own unread list,
// through the endpoint the bell icon calls.

const TITLE_FIELD = "Title";
const USER_FIELD = "Assignee";

export const runUserFieldNotifyOnAssignCase = async (
  bugCase: BugCaseFor<"user-field-notify-on-assign">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserFieldNotifyOnAssignCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
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
          // shouldNotify is what puts this column in the notifying set at all.
          options: { isMultiple: false, shouldNotify: true },
        },
      ],
      records: [],
    });
    tableId = table.id;
    const titleFieldId = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    )?.id;
    const userFieldId = table.fields.find(
      (field: { name: string }) => field.name === USER_FIELD,
    )?.id;
    if (!titleFieldId || !userFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: this person has nothing
    // from this table yet, so anything found afterwards came from the
    // assignment.
    const before = await unreadForTable();
    if (before.length !== 0) {
      throw new Error(
        `the assignee already has ${before.length} unread notifications for ${tableId} - the fixture is not ` +
          "in place",
      );
    }

    const probe = await bugCheckpoint(
      "assigning-someone-in-a-member-column-tells-them",
      async () => {
        const created = await apiCreateRecords(tableId, {
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
        });
        const recordId = created.data.records[0]?.id;
        if (!recordId) {
          throw new Error("assigning the row created no row");
        }

        const deadline = Date.now() + config.notifyTimeoutMs;
        for (;;) {
          const unread = await unreadForTable();
          if (unread.length > 0) {
            return {
              recordId,
              waitedMs: config.notifyTimeoutMs - (deadline - Date.now()),
              count: unread.length,
            };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }

        throw new Error(
          `${config.notifyTimeoutMs}ms after being assigned, ${assignee.email} has nothing about this table ` +
            "in their notifications - the row says the work is theirs and they have no way to know",
        );
      },
    );

    return {
      details: {
        tableId,
        recordId: probe.recordId,
        notifications: probe.count,
        waitedMs: probe.waitedMs,
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
