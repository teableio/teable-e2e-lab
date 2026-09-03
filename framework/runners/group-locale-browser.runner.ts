import { FieldType, Role, SortFunc, ViewType } from "@teable/core";
import type { IUserMeVo } from "@teable/openapi";
import {
  createView,
  emailSpaceInvitation,
  getBaseById,
  UPDATE_USER_LANG,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { openBrowserPage } from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
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

const cookieText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join("; ");
  if (typeof value === "string") return value;
  throw new Error("the Chinese member session has no cookie");
};

export const runGroupLocaleBrowserCase = async (
  bugCase: BugCaseFor<"group-locale-browser">,
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
    await readerAxios.patch(UPDATE_USER_LANG, { lang: "zh" });
    const localizedReader = (await readerAxios.get<IUserMeVo>(USER_ME)).data;
    if (localizedReader.lang !== "zh") {
      throw new Error(
        `the locale fixture kept user language ${JSON.stringify(localizedReader.lang)}`,
      );
    }
    const spaceId = (await getBaseById(baseId)).data.spaceId;
    await emailSpaceInvitation({
      spaceId,
      emailSpaceInvitationRo: { emails: [readerEmail], role: Role.Editor },
    });

    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
        { name: "Category", type: FieldType.SingleLineText },
      ],
      records: [
        { fields: { Name: "alpha", Category: "one" } },
        { fields: { Name: "beta", Category: "two" } },
      ],
    });
    tableId = table.id;
    const groupField = table.fields.find((field) => field.name === "Category");
    if (!groupField) throw new Error("the locale fixture has no group field");
    const view = (
      await createView(tableId, {
        name: "Chinese grouped grid",
        type: ViewType.Grid,
        group: [{ fieldId: groupField.id, order: SortFunc.Asc }],
      })
    ).data;

    browser = await openBrowserPage(context, {
      cookie: cookieText(readerAxios.defaults.headers.Cookie),
      locale: "zh",
    });
    const pageErrors: string[] = [];
    browser.page.on("pageerror", (error) => pageErrors.push(error.message));
    await browser.page.goto(
      `${browser.frontendUrl}/base/${baseId}/table/${tableId}/${view.id}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 180_000,
      },
    );
    try {
      await waitUntil(
        async () =>
          (await browser!.page.locator('[data-t-grid-stage="true"]').count()) >
          0,
        config.settleTimeoutMs,
        "the Chinese grouped grid did not mount",
      );
    } catch (error) {
      const body = await browser.page.locator("body").textContent();
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; URL=${browser.page.url()} body=${JSON.stringify(body)} pageErrors=${JSON.stringify(pageErrors)}`,
      );
    }

    const probe = await bugCheckpoint(
      "group-tools-use-the-active-Chinese-locale",
      async () => {
        const toolbarLabel = "\u5206\u7ec4(1)";
        const settingsTitle = "\u5206\u7ec4\u65b9\u5f0f";
        const addGroupLabel = "\u6dfb\u52a0\u53e6\u4e00\u4e2a\u5206\u7ec4";
        const activeLabel = browser!.page.locator(
          `button:has-text("${toolbarLabel}")`,
        );
        await waitUntil(
          async () => (await activeLabel.count()) > 0,
          config.settleTimeoutMs,
          `the active group control did not render its Chinese label; URL=${browser!.page.url()} body=${JSON.stringify(await browser!.page.locator("body").textContent())}`,
        );
        const bodyBefore =
          (await browser!.page.locator("body").textContent()) ?? "";
        if (bodyBefore.includes("Group by 1 field")) {
          throw new Error(
            "the Chinese toolbar fell back to the English singular group label",
          );
        }
        await activeLabel.click({ force: true });
        await waitUntil(
          async () => {
            const text =
              (await browser!.page.locator("body").textContent()) ?? "";
            return text.includes(settingsTitle) && text.includes(addGroupLabel);
          },
          config.settleTimeoutMs,
          "the group settings did not remain Chinese after opening",
        );
        if (pageErrors.length > 0) {
          throw new Error(
            `the grouped page raised errors: ${pageErrors.join(" | ")}`,
          );
        }
        return {
          toolbarLabel,
          settingsLabels: [settingsTitle, addGroupLabel],
        };
      },
    );

    return {
      details: { tableId, viewId: view.id, readerId: reader.id, ...probe },
    };
  } finally {
    await browser?.close().catch(() => undefined);
    if (tableId)
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
  }
};
