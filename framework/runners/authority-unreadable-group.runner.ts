import {
  FieldKeyType,
  FieldType,
  IdPrefix,
  Role,
  SortFunc,
  ViewType,
} from "@teable/core";
import type { IRecordsVo, IUserMeVo } from "@teable/openapi";
import {
  axios,
  createView,
  emailSpaceInvitation,
  getBaseById,
  getRecords as apiGetRecords,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import {
  openBrowserPage,
  type BrowserLocator,
  type BrowserWebSocketFrame,
} from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { realtimeClient } from "../realtime";
import type { RealtimeQuerySubscription } from "../realtime";
import type {
  AuthorityUnreadableGroupCaseConfig,
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
} from "../types";

const TITLE_FIELD = "Title";
const GROUP_FIELD = "Category";
const STATUS_FIELD = "Status";

interface AuthorityRoleResponse {
  id: string;
}

type ReaderAxios = Awaited<ReturnType<typeof createNewUserAxios>>;

type RecordsResponse = {
  status: number;
  data: IRecordsVo;
  headers: Record<string, unknown>;
};

type RoleTable = {
  authorityMatrixRoleId?: string;
  enabled: true;
  tableId: string;
  disabledActions: string[];
  recordFilter: Record<string, unknown> | null;
  fieldRecordPermission: {
    fieldId: string;
    disabledActions?: string[];
  }[];
};

const cookieText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join("; ");
  if (typeof value === "string") return value;
  throw new Error("the restricted member session has no cookie");
};

const sortedIds = (records: { id: string }[]) =>
  records.map((record) => record.id).sort();

const assertRecordIds = (
  records: { id: string }[],
  expectedIds: string[],
  label: string,
) => {
  const actual = sortedIds(records);
  const expected = [...expectedIds].sort();
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(
      `${label} returned ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
  return actual;
};

const assertReadableRecordShape = (
  response: IRecordsVo,
  titleFieldId: string,
  unreadableFieldId: string,
  label: string,
) => {
  for (const record of response.records) {
    if (!(titleFieldId in record.fields)) {
      throw new Error(`${label} omitted the readable title on ${record.id}`);
    }
    if (unreadableFieldId in record.fields) {
      throw new Error(
        `${label} exposed unreadable field ${unreadableFieldId} on ${record.id}: ${JSON.stringify(record.fields)}`,
      );
    }
  }
};

const waitForGridStage = async (locator: BrowserLocator, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await locator.count();
    if (count > 0) {
      return { mountedStageCount: count };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the restricted grid did not mount a canvas stage");
};

const waitUntil = async (
  predicate: () => boolean,
  timeoutMs: number,
  message: () => string | Promise<string>,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(await message());
};

const frameText = (frame: BrowserWebSocketFrame) =>
  typeof frame.payload === "string"
    ? frame.payload
    : frame.payload.toString("utf8");

const restrictedRead = async (
  readerAxios: ReaderAxios,
  tableId: string,
  params: Record<string, unknown>,
) =>
  readerAxios.get<IRecordsVo>(`/table/${tableId}/record`, {
    params,
    validateStatus: () => true,
  });

const assertSuccessfulRecordResponse = (
  response: RecordsResponse,
  label: string,
) => {
  if (response.status !== 200 || !Array.isArray(response.data?.records)) {
    throw new Error(
      `${label} answered ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }
};

export const runAuthorityUnreadableGroupCase = async (
  bugCase: BugCaseFor<"authority-unreadable-group">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AuthorityUnreadableGroupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";
  let matrixEnabled = false;
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;
  let realtime: ReturnType<typeof realtimeClient> | undefined;
  let rowSubscription: RealtimeQuerySubscription | undefined;

  try {
    const readerEmail = `${tableName}@example.com`;
    const readerAxios = await createNewUserAxios({
      email: readerEmail,
      password: "12345678a",
    });
    const reader = (await readerAxios.get<IUserMeVo>(USER_ME)).data;
    const readerCookie = cookieText(readerAxios.defaults.headers.Cookie);
    const spaceId = (await getBaseById(baseId)).data.spaceId;
    await emailSpaceInvitation({
      spaceId,
      emailSpaceInvitationRo: { emails: [readerEmail], role: Role.Editor },
    });

    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: GROUP_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [...new Set(config.rows.map((row) => row.group))].map(
              (name) => ({ name }),
            ),
          },
        },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [...new Set(config.rows.map((row) => row.status))].map(
              (name) => ({ name }),
            ),
          },
        },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [TITLE_FIELD]: row.title,
          [GROUP_FIELD]: row.group,
          [STATUS_FIELD]: row.status,
        },
      })),
    });
    tableId = table.id;
    const titleField = table.fields.find((field) => field.name === TITLE_FIELD);
    const groupField = table.fields.find((field) => field.name === GROUP_FIELD);
    const statusField = table.fields.find(
      (field) => field.name === STATUS_FIELD,
    );
    if (
      !titleField ||
      !groupField ||
      !statusField ||
      table.records.length !== config.rows.length
    ) {
      throw new Error("the grouped permission fixture is incomplete");
    }
    const everyRecordId = table.records.map((record) => record.id);
    const conditionallyVisibleIds = table.records
      .filter((_, index) => config.rows[index]?.title !== "beta")
      .map((record) => record.id);

    const unreadableGroupView = (
      await createView(tableId, {
        name: "Unreadable grouped grid",
        type: ViewType.Grid,
        group: [{ fieldId: groupField.id, order: SortFunc.Asc }],
      })
    ).data;
    const conditionalGroupView = (
      await createView(tableId, {
        name: "Conditionally masked grouped grid",
        type: ViewType.Grid,
        group: [{ fieldId: statusField.id, order: SortFunc.Asc }],
      })
    ).data;
    const filteredSortedView = (
      await createView(tableId, {
        name: "Unreadable filtered and sorted grid",
        type: ViewType.Grid,
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: groupField.id,
              operator: "is",
              value: config.rows[0]?.group,
            },
          ],
        },
        sort: {
          sortObjs: [{ fieldId: groupField.id, order: SortFunc.Asc }],
        },
      })
    ).data;

    const ownerUnreadableView = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      viewId: unreadableGroupView.id,
      groupBy: unreadableGroupView.group ?? [],
      includeQueryExtra: true,
      take: config.rows.length,
    });
    const ownerRouting = assertServedByV2(ownerUnreadableView.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    assertRecordIds(
      ownerUnreadableView.data.records,
      everyRecordId,
      "the owner's grouped fixture read",
    );
    const ownerConditionalView = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      viewId: conditionalGroupView.id,
      groupBy: conditionalGroupView.group ?? [],
      includeQueryExtra: true,
      take: config.rows.length,
    });
    assertRecordIds(
      ownerConditionalView.data.records,
      everyRecordId,
      "the owner's conditional-group fixture read",
    );
    const ownerFilteredView = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      viewId: filteredSortedView.id,
      take: config.rows.length,
    });
    if (ownerFilteredView.data.records.length === everyRecordId.length) {
      throw new Error(
        "the owner's filtered view did not narrow the fixture before permissions were applied",
      );
    }

    await axios.patch(`/base/${baseId}/authority-matrix/status`, {
      enabled: true,
    });
    matrixEnabled = true;

    const role = await axios
      .post<AuthorityRoleResponse>(`/base/${baseId}/authority-matrix-role`, {
        name: `group-reader-${context.runId}`,
        enabled: true,
        tables: [
          {
            enabled: true,
            tableId,
            disabledActions: [],
            recordFilter: null,
            fieldRecordPermission: table.fields.map((field) => ({
              fieldId: field.id,
            })),
          },
        ],
      })
      .then((response) => response.data);

    const updateRole = async (tablePermission: RoleTable) => {
      await axios.put(`/base/${baseId}/authority-matrix-role/${role.id}`, {
        name: `group-reader-${context.runId}`,
        enabled: true,
        tables: [{ ...tablePermission, authorityMatrixRoleId: role.id }],
      });
    };
    const unreadableGroupPermission: RoleTable = {
      enabled: true,
      tableId,
      disabledActions: [],
      recordFilter: null,
      fieldRecordPermission: [
        { fieldId: titleField.id },
        {
          fieldId: groupField.id,
          disabledActions: ["record|read", "record|update", "record|create"],
        },
        { fieldId: statusField.id },
      ],
    };
    await updateRole(unreadableGroupPermission);
    await axios.patch(`/base/${baseId}/authority-matrix-role/${role.id}/user`, {
      userIds: [reader.id],
    });
    await axios.put(`/base/${baseId}/authority-matrix`, {
      defaultRole: role.id,
    });

    browser = await openBrowserPage(context, {
      cookie: readerCookie,
      locale: "zh",
    });
    const pageErrors: string[] = [];
    const socketErrors: string[] = [];
    const sentSocketFrames: string[] = [];
    const receivedSocketFrames: string[] = [];
    browser.page.on("pageerror", (error) => pageErrors.push(error.message));
    browser.page.on("websocket", (socket) => {
      socket.on("framesent", (frame) =>
        sentSocketFrames.push(frameText(frame)),
      );
      socket.on("framereceived", (frame) =>
        receivedSocketFrames.push(frameText(frame)),
      );
      socket.on("socketerror", (error) => socketErrors.push(error));
    });

    let explicitUnreadableHeaders: Record<string, unknown> = {};
    const browserProbe = await bugCheckpoint(
      "restricted-grid-loads-and-subscribes-without-its-unreadable-group",
      async () => {
        const navigation = await browser!.page.goto(
          `${browser!.frontendUrl}/base/${baseId}/table/${tableId}/${unreadableGroupView.id}`,
          { waitUntil: "domcontentloaded", timeout: 300_000 },
        );
        if (!navigation || navigation.status() !== 200) {
          throw new Error(
            `the restricted grid navigation answered ${navigation?.status() ?? "without a response"}`,
          );
        }
        const recordCollection = `${IdPrefix.Record}_${tableId}`;
        await waitUntil(
          () =>
            sentSocketFrames.some((frame) => frame.includes(recordCollection)),
          config.subscribeTimeoutMs,
          async () =>
            `the restricted grid did not subscribe to ${recordCollection}; page errors: ${JSON.stringify(pageErrors)}; socket errors: ${JSON.stringify(socketErrors)}; sent frames: ${JSON.stringify(sentSocketFrames)}; page text: ${JSON.stringify(await browser!.page.locator("body").textContent())}`,
        );
        const recordSubscriptionFrames = sentSocketFrames.filter((frame) =>
          frame.includes(recordCollection),
        );
        if (
          recordSubscriptionFrames.some((frame) =>
            frame.includes(groupField.id),
          )
        ) {
          throw new Error(
            `the restricted grid subscribed with unreadable group field ${groupField.id}: ${JSON.stringify(recordSubscriptionFrames)}`,
          );
        }
        await waitUntil(
          () =>
            everyRecordId.every((recordId) =>
              receivedSocketFrames.some((frame) => frame.includes(recordId)),
            ),
          config.subscribeTimeoutMs,
          () =>
            `the restricted grid subscription did not receive every permitted row ${JSON.stringify(everyRecordId)}; received frames: ${JSON.stringify(receivedSocketFrames)}`,
        );
        const gridStage = await waitForGridStage(
          browser!.page.locator('[data-t-grid-stage="true"]'),
          config.settleTimeoutMs,
        );
        await browser!.page.waitForTimeout(250);
        if (pageErrors.length > 0) {
          throw new Error(
            `the restricted grid raised page errors: ${JSON.stringify(pageErrors)}`,
          );
        }
        if (socketErrors.length > 0) {
          throw new Error(
            `the restricted grid raised socket errors: ${JSON.stringify(socketErrors)}`,
          );
        }

        const explicitRead = await restrictedRead(readerAxios, tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId: unreadableGroupView.id,
          groupBy: JSON.stringify(unreadableGroupView.group ?? []),
          includeQueryExtra: true,
          take: config.rows.length,
        });
        explicitUnreadableHeaders = explicitRead.headers;
        assertSuccessfulRecordResponse(
          explicitRead,
          "the explicit unreadable-group API read",
        );
        const explicitRecordIds = assertRecordIds(
          explicitRead.data.records,
          everyRecordId,
          "the explicit unreadable-group API read",
        );
        assertReadableRecordShape(
          explicitRead.data,
          titleField.id,
          groupField.id,
          "the explicit unreadable-group API read",
        );

        realtime = realtimeClient(context.appUrl, readerCookie);
        rowSubscription = await realtime.subscribeQuery(
          `${IdPrefix.Record}_${tableId}`,
          { viewId: unreadableGroupView.id, type: IdPrefix.Record },
          { timeoutMs: config.subscribeTimeoutMs },
        );
        await rowSubscription.waitFor(
          (ids) =>
            [...ids].sort().join(",") === [...everyRecordId].sort().join(","),
          {
            timeoutMs: config.subscribeTimeoutMs,
            describe: "every permitted row in the restricted grouped grid",
          },
        );
        if (rowSubscription.errors().length > 0) {
          throw new Error(
            `the restricted grid subscription errored: ${JSON.stringify(rowSubscription.errors())}`,
          );
        }

        return {
          explicitRecordIds,
          browserSubscriptionFrameCount: recordSubscriptionFrames.length,
          browserReceivedRecordIds: everyRecordId,
          apiSubscribedRecordIds: [...rowSubscription.ids()].sort(),
          gridStage,
        };
      },
    );
    const unreadableApiRouting = assertServedByV2(explicitUnreadableHeaders, {
      operation: "GET /table/{tableId}/record with an unreadable view group",
      feature: "getRecords",
    });

    rowSubscription.close();
    rowSubscription = undefined;
    realtime.close();
    realtime = undefined;
    await browser.close();
    browser = undefined;

    await updateRole({
      enabled: true,
      tableId,
      disabledActions: [],
      recordFilter: {
        conjunction: "and",
        filterSet: [
          {
            fieldId: titleField.id,
            operator: "isNot",
            value: "beta",
          },
        ],
      },
      fieldRecordPermission: table.fields.map((field) => ({
        fieldId: field.id,
      })),
    });

    let conditionalHeaders: Record<string, unknown> = {};
    const conditionalProbe = await bugCheckpoint(
      "conditionally-masked-group-degrades-with-permitted-records",
      async () => {
        const response = await restrictedRead(readerAxios, tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId: conditionalGroupView.id,
          groupBy: JSON.stringify(conditionalGroupView.group ?? []),
          includeQueryExtra: true,
          take: config.rows.length,
        });
        conditionalHeaders = response.headers;
        assertSuccessfulRecordResponse(
          response,
          "the conditionally masked group API read",
        );
        return {
          recordIds: assertRecordIds(
            response.data.records,
            conditionallyVisibleIds,
            "the conditionally masked group API read",
          ),
        };
      },
    );
    const conditionalRouting = assertServedByV2(conditionalHeaders, {
      operation:
        "GET /table/{tableId}/record with a conditionally masked view group",
      feature: "getRecords",
    });

    await updateRole(unreadableGroupPermission);

    let filterSortHeaders: Record<string, unknown> = {};
    const filterSortProbe = await bugCheckpoint(
      "unreadable-view-filter-and-sort-preserve-readable-records",
      async () => {
        const response = await restrictedRead(readerAxios, tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId: filteredSortedView.id,
          take: config.rows.length,
        });
        filterSortHeaders = response.headers;
        assertSuccessfulRecordResponse(
          response,
          "the unreadable filter-and-sort API read",
        );
        const recordIds = assertRecordIds(
          response.data.records,
          everyRecordId,
          "the unreadable filter-and-sort API read",
        );
        assertReadableRecordShape(
          response.data,
          titleField.id,
          groupField.id,
          "the unreadable filter-and-sort API read",
        );
        return { recordIds };
      },
    );
    const filterSortRouting = assertServedByV2(filterSortHeaders, {
      operation:
        "GET /table/{tableId}/record with an unreadable view filter and sort",
      feature: "getRecords",
    });

    return {
      details: {
        tableId,
        readerId: reader.id,
        unreadableGroupViewId: unreadableGroupView.id,
        conditionalGroupViewId: conditionalGroupView.id,
        filteredSortedViewId: filteredSortedView.id,
        browserSubscriptionFrameCount:
          browserProbe.browserSubscriptionFrameCount,
        browserReceivedRecordIds: browserProbe.browserReceivedRecordIds,
        explicitUnreadableRecordIds: browserProbe.explicitRecordIds,
        apiSubscribedRecordIds: browserProbe.apiSubscribedRecordIds,
        browserGridStage: browserProbe.gridStage,
        conditionalRecordIds: conditionalProbe.recordIds,
        filterSortRecordIds: filterSortProbe.recordIds,
        ownerRouting,
        unreadableApiRouting,
        conditionalRouting,
        filterSortRouting,
      },
    };
  } finally {
    rowSubscription?.close();
    realtime?.close();
    await browser?.close().catch(() => undefined);
    if (matrixEnabled) {
      try {
        await axios.put(`/base/${baseId}/authority-matrix`, {
          defaultRole: null,
        });
        await axios.patch(`/base/${baseId}/authority-matrix/status`, {
          enabled: false,
        });
      } catch (error) {
        console.warn(
          `[e2e-lab] authority cleanup failed for ${bugCase.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (tableId) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
};
