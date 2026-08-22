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
  urlBuilder,
  CREATE_RECORD,
  NOTIFICATION_LIST,
  NOTIFICATION_READ_ALL,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserFieldNotifyBurstCaseConfig } from "../types";

// Assign the same person on N records in a row, as fast as the API answers ->
// checkpoint: they get a handful of notifications, not N of them.
//
// The other half of the change the two sibling runners guard. Silencing the
// paths that only move assignments around fixes the case where nobody assigned
// anyone. It does nothing for the case where somebody really did assign
// twenty rows in one sitting - filling in a sprint board, pasting a column of
// owners - and the person on the receiving end gets twenty notifications and
// twenty emails for one act of planning.
//
// The fix coalesces per actor and table: the first delivery goes out at once
// so nothing feels delayed, and everything raised while the window is open is
// merged into a single follow-up. So the expected steady state is two, not
// one, and the case asserts a ceiling rather than an exact count - the exact
// number depends on how the burst lines up with the window, and pinning it
// would make this case fail for timing rather than for behavior.
//
// The ceiling has to sit below N and above the coalesced result, which is why
// the runner refuses a fixture where those two are not separated by room to
// tell them apart.
//
// The wait is what makes the count meaningful: the merged notification is
// delivered when the window elapses, so a case that counted early would see
// the fix's first instant delivery, call it one, and pass on a commit that
// coalesces nothing.

const TITLE_FIELD = "Title";
const USER_FIELD = "Assignee";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runUserFieldNotifyBurstCase = async (
  bugCase: BugCaseFor<"user-field-notify-burst">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserFieldNotifyBurstCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  let tableId = "";

  // Fixture arithmetic, before anything is built: a ceiling that is not
  // strictly between the coalesced result and the burst size cannot separate
  // them, and the case would be asserting nothing.
  if (config.maxNotifications >= config.burstSize) {
    throw new Error(
      `the ceiling is ${config.maxNotifications} and the burst is ${config.burstSize} rows - ` +
        "a ceiling at or above the burst size passes even when nothing is coalesced",
    );
  }
  if (config.maxNotifications < 2) {
    throw new Error(
      `the ceiling is ${config.maxNotifications} - the fix delivers the first notification immediately and merges the rest into a second, ` +
        "so a ceiling below 2 fails on the fixed behavior",
    );
  }

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

    // Nothing unread to start with, so the count at the end is this burst's
    // and only this burst's.
    await assigneeAxios.patch(NOTIFICATION_READ_ALL);

    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: USER_FIELD,
          type: FieldType.User,
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

    // One request per row rather than one batch of N: a batch is a single act
    // of assignment and has always produced a single notification. What this
    // case is about is N separate acts in quick succession, which is what
    // filling in a column actually looks like.
    let createRouting;
    const burstStartedAt = Date.now();
    for (let index = 0; index < config.burstSize; index++) {
      const response = await axios.post(
        urlBuilder(CREATE_RECORD, { tableId }),
        {
          fieldKeyType: FieldKeyType.Id,
          records: [
            {
              fields: {
                [titleFieldId]: `${config.rowTitlePrefix}-${index + 1}`,
                [userFieldId]: {
                  id: assignee.id,
                  title: assignee.name,
                  email: assignee.email,
                },
              },
            },
          ],
        },
      );
      if (index === 0) {
        createRouting = assertServedByV2(response.headers, {
          operation: "POST /table/{tableId}/record",
          feature: "createRecord",
        });
      }
    }
    const burstFinishedAt = Date.now();

    // Long enough for the coalescing window to elapse and deliver its merged
    // notification. Counting before that would read the fix's first instant
    // delivery as the whole story.
    await sleep(config.settleAfterBurstMs);

    const probe = await bugCheckpoint(
      "a-burst-of-assignments-arrives-coalesced",
      async () => {
        const seen = await unreadForTable();
        // Fixture verification that has to be inside the checkpoint, because
        // outside it "zero" would be indistinguishable from a clean pass: a
        // burst that notified nobody at all means the assignments never landed
        // or notifications are off, and counting that as coalescing would be
        // the worst kind of green.
        if (seen.length === 0) {
          throw new Error(
            `${config.burstSize} assignments produced no notification at all after ${config.settleAfterBurstMs}ms - ` +
              "there is nothing here to coalesce, so this case cannot report on coalescing",
          );
        }
        if (seen.length > config.maxNotifications) {
          throw new Error(
            `${config.burstSize} assignments in a row sent ${assignee.email} ${seen.length} notifications, expected at most ${config.maxNotifications} - ` +
              `one act of planning, ${seen.length} interruptions and ${seen.length} emails`,
          );
        }
        return {
          notificationCount: seen.length,
          messages: seen.map((notification) => notification.message),
        };
      },
    );

    return {
      details: {
        tableId,
        assigneeId: assignee.id,
        burstSize: config.burstSize,
        burstDurationMs: burstFinishedAt - burstStartedAt,
        maxNotifications: config.maxNotifications,
        notificationCount: probe.notificationCount,
        messages: probe.messages,
        createRouting,
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
