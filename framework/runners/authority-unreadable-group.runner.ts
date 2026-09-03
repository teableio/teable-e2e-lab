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
  GroupPointType,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import {
  openBrowserPage,
  type BrowserLocator,
  type BrowserPage,
  type BrowserWebSocketFrame,
} from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
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

type SocketDocIdsResponse = {
  ids: string[];
  extra?: IRecordsVo["extra"];
};

type CanvasTextEntry = {
  text: string;
  x: number;
  y: number;
  canvasWidth: number;
  canvasHeight: number;
};

const cookieText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join("; ");
  if (typeof value === "string") return value;
  throw new Error("the restricted member session has no cookie");
};

const sorted = (values: string[]) => [...values].sort();

const assertIds = (
  actualIds: string[],
  expectedIds: string[],
  label: string,
) => {
  const actual = sorted(actualIds);
  const expected = sorted(expectedIds);
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(
      `${label} returned ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
  return actual;
};

const waitForGridStage = async (locator: BrowserLocator, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await locator.count();
    if (count > 0) return { mountedStageCount: count };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the restricted grid did not mount a canvas stage");
};

const waitUntil = async (
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  message: () => string | Promise<string>,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(await message());
};

const readCanvasText = (page: BrowserPage) =>
  page.evaluate<CanvasTextEntry[]>(
    `Array.from(globalThis.__e2eLabCanvasText ?? [])`,
  );

const frameText = (frame: BrowserWebSocketFrame) =>
  typeof frame.payload === "string"
    ? frame.payload
    : frame.payload.toString("utf8");

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

    const view = (
      await createView(tableId, {
        name: "Category and status grouped grid",
        type: ViewType.Grid,
        group: [
          { fieldId: groupField.id, order: SortFunc.Asc },
          { fieldId: statusField.id, order: SortFunc.Asc },
        ],
      })
    ).data;
    if (
      view.group?.map(({ fieldId }) => fieldId).join(",") !==
      `${groupField.id},${statusField.id}`
    ) {
      throw new Error("the two-level grouped view did not persist as declared");
    }

    const ownerRead = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      viewId: view.id,
      groupBy: view.group ?? [],
      includeQueryExtra: true,
      take: config.rows.length,
    });
    const ownerRouting = assertServedByV2(ownerRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    assertIds(
      ownerRead.data.records.map((record) => record.id),
      everyRecordId,
      "the owner's grouped fixture read",
    );

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
            fieldRecordPermission: [
              { fieldId: titleField.id },
              {
                fieldId: groupField.id,
                disabledActions: [
                  "record|read",
                  "record|update",
                  "record|create",
                ],
              },
              { fieldId: statusField.id },
            ],
          },
        ],
      })
      .then((response) => response.data);
    await axios.patch(`/base/${baseId}/authority-matrix-role/${role.id}/user`, {
      userIds: [reader.id],
    });
    await axios.put(`/base/${baseId}/authority-matrix`, {
      defaultRole: role.id,
    });

    const readableGroup =
      view.group?.filter((item) => item.fieldId !== groupField.id) ?? [];
    if (
      readableGroup.length !== 1 ||
      readableGroup[0]?.fieldId !== statusField.id
    ) {
      throw new Error("the readable group fixture did not retain status");
    }

    browser = await openBrowserPage(context, {
      cookie: readerCookie,
      locale: "zh",
      captureCanvasText: true,
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

    let socketHeaders: Record<string, unknown> = {};
    const probe = await bugCheckpoint(
      "restricted-grid-keeps-its-readable-status-group",
      async () => {
        const navigation = await browser!.page.goto(
          `${browser!.frontendUrl}/base/${baseId}/table/${tableId}/${view.id}`,
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
            `the restricted grid subscribed with unreadable category ${groupField.id}: ${JSON.stringify(recordSubscriptionFrames)}`,
          );
        }
        if (
          !recordSubscriptionFrames.some((frame) =>
            frame.includes(statusField.id),
          )
        ) {
          throw new Error(
            `the restricted grid dropped readable status ${statusField.id}: ${JSON.stringify(recordSubscriptionFrames)}`,
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
        await waitUntil(
          async () => {
            const texts = (await readCanvasText(browser!.page)).map(
              ({ text }) => text,
            );
            return (
              texts.includes(STATUS_FIELD) &&
              texts.includes("open") &&
              texts.includes("closed")
            );
          },
          config.settleTimeoutMs,
          async () =>
            `the restricted grid did not draw its readable status groups: ${JSON.stringify(await readCanvasText(browser!.page))}`,
        );
        const canvasText = await readCanvasText(browser!.page);
        const unreadableCategoryDraws = [
          ...new Map(
            canvasText
              .filter(({ text }) => text === GROUP_FIELD)
              .map((entry) => [
                `${entry.x}:${entry.y}:${entry.canvasWidth}:${entry.canvasHeight}`,
                entry,
              ]),
          ).values(),
        ];
        if (unreadableCategoryDraws.length > 0) {
          throw new Error(
            `the restricted grid drew the unreadable category as a group level: ${JSON.stringify(unreadableCategoryDraws)}`,
          );
        }

        const socketRead = await readerAxios.post<SocketDocIdsResponse>(
          `/table/${tableId}/record/socket/doc-ids`,
          {
            fieldKeyType: FieldKeyType.Id,
            viewId: view.id,
            ignoreViewQuery: true,
            groupBy: JSON.stringify(readableGroup),
            projection: [titleField.id, statusField.id],
            includeQueryExtra: true,
          },
          { validateStatus: () => true },
        );
        socketHeaders = socketRead.headers;
        if (socketRead.status !== 201 || !Array.isArray(socketRead.data?.ids)) {
          throw new Error(
            `the readable-group socket API answered ${socketRead.status}: ${JSON.stringify(socketRead.data)}`,
          );
        }
        const apiRecordIds = assertIds(
          socketRead.data.ids,
          everyRecordId,
          "the readable-group socket API",
        );
        const headers = (socketRead.data.extra?.groupPoints ?? []).filter(
          (point) => point.type === GroupPointType.Header,
        );
        const depths = headers.map((point) => point.depth);
        const values = headers.map((point) => String(point.value)).sort();
        if (depths.join(",") !== "0,0" || values.join(",") !== "closed,open") {
          throw new Error(
            `the readable status group returned depths ${JSON.stringify(depths)} and values ${JSON.stringify(values)}`,
          );
        }
        if (pageErrors.length > 0 || socketErrors.length > 0) {
          throw new Error(
            `the restricted grid raised errors: page=${JSON.stringify(pageErrors)} socket=${JSON.stringify(socketErrors)}`,
          );
        }

        return {
          browserSubscriptionFrameCount: recordSubscriptionFrames.length,
          browserReceivedRecordIds: sorted(everyRecordId),
          apiRecordIds,
          groupDepths: depths,
          groupValues: values,
          gridStage,
          renderedGroupValues: ["closed", "open"],
        };
      },
    );
    const socketRouting = assertServedByV2(socketHeaders, {
      operation: "POST /table/{tableId}/record/socket/doc-ids",
      feature: "getRecords",
    });

    return {
      details: {
        tableId,
        readerId: reader.id,
        viewId: view.id,
        readableGroupFieldId: statusField.id,
        unreadableGroupFieldId: groupField.id,
        ownerRouting,
        socketRouting,
        ...probe,
      },
    };
  } finally {
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
      await permanentDeleteTable(baseId, tableId).catch((error: unknown) => {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }
};
