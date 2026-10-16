import type { INotification } from "@teable/core";
import {
  FieldKeyType,
  FieldType,
  NotificationStatesEnum,
  Role,
} from "@teable/core";
import type { INotificationVo } from "@teable/openapi";
import { NOTIFICATION_LIST } from "@teable/openapi";
import {
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  UserFieldNotifyDefaultCaseConfig,
} from "../types";
import {
  describeResponse,
  dropTables,
  isSuccess,
  rawRequest,
  sleep,
} from "./raw-api";
import { signUpAndInvite } from "./second-person";

// A member column created through the API without saying whether to notify
// -> a row assigned to a collaborator -> checkpoint: the column stores
// "don't notify", and the collaborator has no notification from this table.
//
// Notifying is opt-in in the editor. A column created by a script or an
// integration, which never mentions notifications, defaulted to notifying -
// so a bulk import into a fresh member column messaged every person it named,
// once per row, with no switch they had chosen to turn on.
//
// The quiet window has to outlast the delivery the bug used to make; the
// stored option is checked as well, so the case does not rest on timing
// alone.

const TITLE_FIELD = "Title";
const USER_FIELD = "Assignee";

export const runUserFieldNotifyDefaultCase = async (
  bugCase: BugCaseFor<"user-field-notify-default">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserFieldNotifyDefaultCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const { client: assignee, me } = await signUpAndInvite(
      `${config.tableNamePrefix}-${context.runId}@example.com`,
      Role.Editor,
    );
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.push(table.id);
    const unreadForTable = async () =>
      (
        (
          await assignee.get<INotificationVo>(NOTIFICATION_LIST, {
            params: { notifyStates: NotificationStatesEnum.Unread },
          })
        ).data.notifications ?? []
      ).filter((notification: INotification) =>
        notification.url.includes(table.id),
      );
    if ((await unreadForTable()).length !== 0) {
      throw new Error("the assignee already has notifications from this table");
    }

    const probe = await bugCheckpoint(
      "a-member-column-created-without-a-choice-stays-quiet",
      async () => {
        const created = await rawRequest<{ id?: string }>(
          "POST",
          `/table/${table.id}/field`,
          { type: FieldType.User, name: USER_FIELD },
        );
        if (!isSuccess(created) || !created.data?.id) {
          throw new Error(
            `creating the member column answered ${describeResponse(created)}`,
          );
        }
        const routing = assertServedByV2(created.headers, {
          operation: "POST /table/{tableId}/field",
          feature: "createField",
        });
        const userFieldId = created.data.id;
        const stored = (
          (await getField(table.id, userFieldId)).options as {
            shouldNotify?: boolean;
          }
        )?.shouldNotify;
        const row = await rawRequest("POST", `/table/${table.id}/record`, {
          fieldKeyType: FieldKeyType.Id,
          records: [
            {
              fields: {
                [userFieldId]: { id: me.id, title: me.name },
              },
            },
          ],
        });
        if (!isSuccess(row)) {
          throw new Error(
            `assigning the row answered ${describeResponse(row)}`,
          );
        }
        await sleep(config.quietWindowMs);
        const received = await unreadForTable();
        if (stored === true || received.length > 0) {
          throw new Error(
            `a member column created without a notify choice stores shouldNotify=${JSON.stringify(stored)}, ` +
              `and the assignee received ${received.length} notification(s) from this table`,
          );
        }
        return { routing, stored: stored ?? null };
      },
    );

    return { details: { tableId: table.id, shouldNotify: probe.stored } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
