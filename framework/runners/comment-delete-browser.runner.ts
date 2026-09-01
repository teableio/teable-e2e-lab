import { FieldKeyType, FieldType, Role } from "@teable/core";
import type {
  ICommentVo,
  IGetCommentListVo,
  IRecordsVo,
  IUserMeVo,
} from "@teable/openapi";
import {
  CommentNodeType,
  CREATE_COMMENT,
  emailSpaceInvitation,
  getBaseById,
  GET_COMMENT_LIST,
  GET_RECORDS_URL,
  USER_ME,
  urlBuilder,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { openBrowserPage } from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

const waitUntil = async (
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  message: string,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
};

const commentContent = (value: string) => [
  {
    type: CommentNodeType.Paragraph,
    children: [{ type: CommentNodeType.Text, value }],
  },
];

const cookieText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join("; ");
  if (typeof value === "string") return value;
  throw new Error("the commenting member session has no cookie");
};

export const runCommentDeleteBrowserCase = async (
  bugCase: BugCaseFor<"comment-delete-browser">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  let tableId = "";
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;

  try {
    const readerEmail = `${config.tableNamePrefix}-${context.runId}@example.com`;
    const readerAxios = await createNewUserAxios({
      email: readerEmail,
      password: "12345678a",
    });
    const reader = (await readerAxios.get<IUserMeVo>(USER_ME)).data;
    const spaceId = (await getBaseById(baseId)).data.spaceId;
    await emailSpaceInvitation({
      spaceId,
      emailSpaceInvitationRo: { emails: [readerEmail], role: Role.Editor },
    });

    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { Name: "commented-record" } }],
    });
    tableId = table.id;
    const record = table.records[0];
    const viewId = table.defaultViewId;
    if (!record || !viewId)
      throw new Error("the comment fixture is incomplete");

    const first = (
      await readerAxios.post<ICommentVo>(
        urlBuilder(CREATE_COMMENT, { tableId, recordId: record.id }),
        {
          content: commentContent(config.deletedText),
          quoteId: null,
        },
      )
    ).data as ICommentVo;
    const second = (
      await readerAxios.post<ICommentVo>(
        urlBuilder(CREATE_COMMENT, { tableId, recordId: record.id }),
        {
          content: commentContent(config.retainedText),
          quoteId: null,
        },
      )
    ).data as ICommentVo;
    const seeded = await readerAxios.get<IGetCommentListVo>(
      urlBuilder(GET_COMMENT_LIST, { tableId, recordId: record.id }),
    );
    if (
      seeded.data.comments
        .map((comment) => comment.id)
        .sort()
        .join(",") !== [first.id, second.id].sort().join(",")
    ) {
      throw new Error(
        "the two-comment fixture did not land before the browser opened",
      );
    }

    const fixtureRead = await readerAxios.get<IRecordsVo>(
      urlBuilder(GET_RECORDS_URL, { tableId }),
      { params: { fieldKeyType: FieldKeyType.Id, take: 10 } },
    );
    const fixtureRouting = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (!fixtureRead.data.records.some((item) => item.id === record.id)) {
      throw new Error("the commenting member cannot read the target record");
    }

    browser = await openBrowserPage(context, {
      cookie: cookieText(readerAxios.defaults.headers.Cookie),
    });
    const pageErrors: string[] = [];
    const deleteRequests: string[] = [];
    browser.page.on("pageerror", (error) => pageErrors.push(error.message));
    browser.page.on("request", (request) => {
      if (request.method() === "DELETE" && request.url().includes(first.id)) {
        deleteRequests.push(request.url());
      }
    });
    await browser.page.goto(
      `${browser.frontendUrl}/base/${baseId}/table/${tableId}/${viewId}?recordId=${record.id}&commentId=${first.id}&showComment=true`,
      { waitUntil: "domcontentloaded", timeout: 180_000 },
    );
    await waitUntil(
      async () => {
        const text = (await browser!.page.locator("body").textContent()) ?? "";
        return (
          text.includes(config.deletedText) &&
          text.includes(config.retainedText)
        );
      },
      config.settleTimeoutMs,
      `the open comment panel did not show both seeded comments; URL=${browser.page.url()} body=${JSON.stringify(await browser.page.locator("body").textContent())}`,
    );
    if (
      (await browser.page.locator('button.relative:has-text("2")').count()) ===
      0
    ) {
      throw new Error(
        "the open record did not show comment count 2 before deletion",
      );
    }

    const probe = await bugCheckpoint(
      "deleted-comment-leaves-the-open-panel-once",
      async () => {
        const item = browser!.page
          .locator(`div.group.relative:has-text("${config.deletedText}")`)
          .last();
        await item.hover();
        await item.locator("button").last().click();
        await waitUntil(
          async () => {
            const text =
              (await browser!.page.locator("body").textContent()) ?? "";
            return (
              !text.includes(config.deletedText) &&
              text.includes(config.retainedText)
            );
          },
          config.settleTimeoutMs,
          "the deleted comment remained in the current panel",
        );
        const stableUntil = Date.now() + config.quietPeriodMs;
        while (Date.now() < stableUntil) {
          const text =
            (await browser!.page.locator("body").textContent()) ?? "";
          if (text.includes(config.deletedText)) {
            throw new Error(
              "the paged cache restored the deleted comment in the current panel",
            );
          }
          if (!text.includes(config.retainedText)) {
            throw new Error(
              "the retained comment disappeared while the delete settled",
            );
          }
          await browser!.page.waitForTimeout(100);
        }
        await waitUntil(
          async () =>
            (await browser!.page
              .locator('button.relative:has-text("1")')
              .count()) > 0,
          config.settleTimeoutMs,
          "the current record's comment count did not change from 2 to 1",
        );
        const list = (
          await readerAxios.get<IGetCommentListVo>(
            urlBuilder(GET_COMMENT_LIST, { tableId, recordId: record.id }),
          )
        ).data;
        const remainingIds = list.comments.map((comment) => comment.id);
        if (remainingIds.join(",") !== second.id) {
          throw new Error(
            `the API comment list contains ${JSON.stringify(remainingIds)}, expected only the retained comment`,
          );
        }
        if (deleteRequests.length !== 1) {
          throw new Error(
            `the panel issued ${deleteRequests.length} delete requests, expected exactly one`,
          );
        }
        if (pageErrors.length > 0) {
          throw new Error(
            `the comment panel raised errors: ${pageErrors.join(" | ")}`,
          );
        }
        const body = (await browser!.page.locator("body").textContent()) ?? "";
        if (
          body.includes("Comment not found") ||
          body.includes(
            "\u8bf7\u6c42\u7684\u8d44\u6e90\u4e0d\u5b58\u5728\u6216\u672a\u5171\u4eab",
          )
        ) {
          throw new Error(
            "the panel surfaced a not-found error after a successful delete",
          );
        }
        return {
          deletedCommentId: first.id,
          retainedCommentId: second.id,
          remainingIds,
        };
      },
    );

    return {
      details: {
        tableId,
        recordId: record.id,
        readerId: reader.id,
        fixtureRouting,
        ...probe,
      },
    };
  } finally {
    await browser?.close().catch(() => undefined);
    if (tableId)
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
  }
};
