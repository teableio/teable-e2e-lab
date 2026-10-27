import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FieldType, Relationship } from "@teable/core";
import {
  createAxios,
  getSignature as apiGetSignature,
  notify as apiNotify,
  PASTE_BY_ID_URL,
  SUPPORTEDTYPE,
  uploadFile as apiUploadFile,
  UploadType,
  urlBuilder,
} from "@teable/openapi";
import { utils as xlsxUtils, write as xlsxWrite } from "xlsx";
import {
  createField,
  createTable,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  LocalizedErrorKeyCaseConfig,
} from "../types";
import { describeResponse, dropTables, rawRequest } from "./raw-api";
import type { RawResponse } from "./raw-api";

// A refusal the person sees as a toast or a form error -> checkpoint: the
// response carries the translation key (and its context) the page needs to
// show the reason in the person's own language.
//
// The server answers in English and names a translation key beside it; the
// page shows the translation for the key, or the English when there is none.
// A refusal without a key reaches people as English whatever language they
// chose - "View names must be unique" on a Japanese screen. One scenario per
// refusal, each the way a person meets it:
//
//   - field-name-duplicate / view-name-duplicate: renaming to a name already
//     taken in the table. The key names the clashing name as context.
//   - paste-self-link: pasting a title that matches no row into a link that
//     points at its own table, which cannot create the row.
//   - share-auth-without-password / reset-email-unregistered /
//     reset-token-invalid: the share password page and the two password reset
//     forms, asked anonymously, as the pages ask.
//   - table-name-blank: renaming a table to blanks from the sidebar.
//   - excel-empty-sheet: importing a workbook whose sheet has no columns.
//   - app-login-disabled / app-callback-state-invalid: an app's own sign-in
//     screen. It never loads Teable's language files, so here the server
//     translates the message itself; the case also pins the message per
//     language, and English when the request names none.

export const LOCALE_HEADER = "Accept-Language";

type ErrorBody = {
  message?: string;
  code?: string;
  data?: {
    localization?: { i18nKey?: string; context?: Record<string, unknown> };
  };
};

const NAME_FIELD = "Name";
const OTHER_FIELD = "Other";
const LINK_FIELD = "Parent";

export const runLocalizedErrorKeyCase = async (
  bugCase: BugCaseFor<"localized-error-key">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LocalizedErrorKeyCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const headers = { [LOCALE_HEADER]: config.locale };
  const anonymous = createAxios();
  anonymous.defaults.baseURL = `${context.appUrl}/api`;
  // An empty locale sends no language at all.
  const asAnonymous = async (
    method: "GET" | "POST",
    url: string,
    data: unknown,
    locale: string = config.locale,
  ): Promise<RawResponse<ErrorBody>> => {
    const response = await anonymous.request({
      method,
      url,
      data,
      headers: locale ? { [LOCALE_HEADER]: locale } : {},
      maxRedirects: 0,
      validateStatus: () => true,
    });
    return {
      status: response.status,
      data: response.data as ErrorBody,
      headers: response.headers as Record<string, unknown>,
    };
  };
  let shareId = "";

  // The observation every scenario shares.
  const expectLocalized = (
    what: string,
    response: RawResponse<ErrorBody>,
    expectedContext?: Record<string, unknown>,
    expectedMessage?: string,
  ) => {
    const localization = response.data?.data?.localization;
    const problems: string[] = [];
    if (response.status !== config.expectedStatus) {
      problems.push(
        `status ${response.status}, expected ${config.expectedStatus}`,
      );
    }
    if (localization?.i18nKey !== config.expectedKey) {
      problems.push(
        `translation key ${JSON.stringify(localization?.i18nKey ?? null)}, expected ${config.expectedKey}`,
      );
    }
    for (const [name, value] of Object.entries(expectedContext ?? {})) {
      if (localization?.context?.[name] !== value) {
        problems.push(
          `context ${name}=${JSON.stringify(localization?.context?.[name] ?? null)}, expected ${JSON.stringify(value)}`,
        );
      }
    }
    if (!response.data?.message) {
      problems.push("no message to fall back on");
    }
    if (
      expectedMessage !== undefined &&
      response.data?.message !== expectedMessage
    ) {
      problems.push(
        `message ${JSON.stringify(response.data?.message ?? null)}, expected ${JSON.stringify(expectedMessage)}`,
      );
    }
    if (problems.length > 0) {
      throw new Error(
        `${what}: ${problems.join("; ")} - without the key the page shows the refusal in English whatever ` +
          `the person's language. Response: ${describeResponse(response)}`,
      );
    }
    return { status: response.status, key: localization?.i18nKey };
  };

  try {
    if (
      config.scenario === "field-name-duplicate" ||
      config.scenario === "view-name-duplicate"
    ) {
      const table = await createTable(baseId, {
        name: `${config.tableNamePrefix}-${context.runId}`,
        fields: [
          { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
          { name: OTHER_FIELD, type: FieldType.SingleLineText },
        ],
        records: [],
      });
      tableIds.push(table.id);

      if (config.scenario === "field-name-duplicate") {
        const otherId = table.fields[1].id;
        const probe = await bugCheckpoint(
          "a-taken-field-name-is-refused-with-its-translation-key",
          async () => {
            const renamed = await rawRequest<ErrorBody>(
              "PATCH",
              `/table/${table.id}/field/${otherId}`,
              { name: NAME_FIELD },
              headers,
            );
            const created = await rawRequest<ErrorBody>(
              "POST",
              `/table/${table.id}/field`,
              { name: NAME_FIELD, type: FieldType.SingleLineText },
              headers,
            );
            return {
              rename: expectLocalized(
                "renaming a field to a taken name",
                renamed,
                {
                  name: NAME_FIELD,
                },
              ),
              create: expectLocalized(
                "creating a field with a taken name",
                created,
                {
                  name: NAME_FIELD,
                },
              ),
            };
          },
        );
        return { details: { tableId: table.id, ...probe } };
      }

      const second = await rawRequest<{ id?: string }>(
        "POST",
        `/table/${table.id}/view`,
        { name: config.secondViewName, type: "grid" },
      );
      const secondId = second.data?.id;
      if (!secondId) {
        throw new Error(
          `creating the second view answered ${describeResponse(second)}`,
        );
      }
      const firstName = table.views[0].name;
      const probe = await bugCheckpoint(
        "a-taken-view-name-is-refused-with-its-translation-key",
        async () => {
          const renamed = await rawRequest<ErrorBody>(
            "PUT",
            `/table/${table.id}/view/${secondId}/name`,
            { name: firstName },
            headers,
          );
          return expectLocalized("renaming a view to a taken name", renamed, {
            name: firstName,
          });
        },
      );
      return { details: { tableId: table.id, ...probe } };
    }

    if (config.scenario === "paste-self-link") {
      const table = await createTable(baseId, {
        name: `${config.tableNamePrefix}-${context.runId}`,
        fields: [
          { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        ],
        records: [{ fields: { [NAME_FIELD]: "row-1" } }],
      });
      tableIds.push(table.id);
      const link = await createField(table.id, {
        name: LINK_FIELD,
        type: FieldType.Link,
        options: {
          relationship: Relationship.ManyMany,
          foreignTableId: table.id,
        },
      });
      const rowsBefore = (await getRecords(table.id)).records.length;
      const probe = await bugCheckpoint(
        "a-paste-into-a-self-link-is-refused-with-its-translation-key",
        async () => {
          const pasted = await rawRequest<ErrorBody>(
            "PATCH",
            urlBuilder(PASTE_BY_ID_URL, { tableId: table.id }),
            {
              viewId: table.views[0].id,
              selection: {
                recordIds: [table.records[0].id],
                fieldIds: [link.id],
              },
              content: [[config.pastedTitle]],
            },
            headers,
          );
          assertServedByV2(pasted.headers, {
            operation: "PATCH /table/{tableId}/selection/paste-by-id",
            feature: "paste",
          });
          const result = expectLocalized(
            "pasting a new title into a self link",
            pasted,
          );
          const rowsAfter = (await getRecords(table.id)).records.length;
          if (rowsAfter !== rowsBefore) {
            throw new Error(
              `the refused paste still went from ${rowsBefore} to ${rowsAfter} rows`,
            );
          }
          return result;
        },
      );
      return { details: { tableId: table.id, ...probe } };
    }

    if (
      config.scenario === "app-login-disabled" ||
      config.scenario === "app-callback-state-invalid"
    ) {
      const messages = Object.entries(config.messagesByLocale ?? {});
      if (messages.length === 0) {
        throw new Error(
          "the app sign-in scenarios need the expected message per locale",
        );
      }
      let appId = "";
      if (config.scenario === "app-login-disabled") {
        const created = await rawRequest<{ id?: string }>(
          "POST",
          `/base/${baseId}/app`,
          { name: `${config.tableNamePrefix}-${context.runId}` },
        );
        appId = created.data?.id ?? "";
        if (!appId) {
          throw new Error(
            `creating the app answered ${describeResponse(created)}`,
          );
        }
      }
      try {
        const probe = await bugCheckpoint(
          config.scenario === "app-login-disabled"
            ? "an-app-with-sign-in-off-refuses-in-the-visitors-language"
            : "an-expired-app-sign-in-refuses-in-the-visitors-language",
          async () => {
            const seen: Record<string, unknown> = {};
            for (const [locale, message] of messages) {
              const response =
                config.scenario === "app-login-disabled"
                  ? await asAnonymous(
                      "POST",
                      `/base/${baseId}/app/${appId}/auth/send-code`,
                      {
                        email: `${config.tableNamePrefix}@example.com`,
                        environment: "production",
                      },
                      locale,
                    )
                  : await asAnonymous(
                      "GET",
                      `/app-auth/teable/callback?code=x&state=invalid-${context.runId}`,
                      undefined,
                      locale,
                    );
              seen[locale || "(none)"] = expectLocalized(
                `asking with ${locale ? `Accept-Language: ${locale}` : "no language"}`,
                response,
                undefined,
                message,
              );
            }
            return seen;
          },
        );
        return { details: { appId, ...probe } };
      } finally {
        if (appId) {
          await rawRequest("DELETE", `/base/${baseId}/app/${appId}`).catch(
            () => undefined,
          );
        }
      }
    }

    if (config.scenario === "table-name-blank") {
      const table = await createTable(baseId, {
        name: `${config.tableNamePrefix}-${context.runId}`,
        fields: [
          { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        ],
        records: [],
      });
      tableIds.push(table.id);
      const nodes = await rawRequest<
        { id: string; resourceId?: string; resourceMeta?: { name?: string } }[]
      >("GET", `/base/${baseId}/node/list`);
      const node = (Array.isArray(nodes.data) ? nodes.data : []).find(
        (candidate) => candidate.resourceId === table.id,
      );
      if (!node) {
        throw new Error(
          `the table has no node in the base tree: ${describeResponse(nodes)}`,
        );
      }
      const probe = await bugCheckpoint(
        "a-blank-table-name-is-refused-with-its-translation-key",
        async () => {
          const renamed = await rawRequest<ErrorBody>(
            "PUT",
            `/base/${baseId}/node/${node.id}`,
            { name: config.blankName ?? "   " },
            headers,
          );
          const result = expectLocalized("renaming a table to blanks", renamed);
          const tables = await rawRequest<{ id: string; name: string }[]>(
            "GET",
            `/base/${baseId}/table`,
          );
          const kept = (tables.data ?? []).find((t) => t.id === table.id)?.name;
          if (kept !== table.name) {
            throw new Error(
              `the refused rename still renamed the table to ${JSON.stringify(kept)}`,
            );
          }
          return result;
        },
      );
      return { details: { tableId: table.id, ...probe } };
    }

    if (config.scenario === "excel-empty-sheet") {
      const workbook = xlsxUtils.book_new();
      xlsxUtils.book_append_sheet(
        workbook,
        xlsxUtils.aoa_to_sheet([]),
        "Empty",
      );
      const buffer = xlsxWrite(workbook, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;
      const tmpPath = join(tmpdir(), `e2e-lab-${context.runId}-empty.xlsx`);
      await writeFile(tmpPath, buffer);
      const signature = await apiGetSignature(
        {
          type: UploadType.Import,
          contentLength: buffer.byteLength,
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        undefined,
      );
      await apiUploadFile(
        signature.data.token,
        createReadStream(tmpPath),
        signature.data.requestHeaders,
      );
      const notified = await apiNotify(
        signature.data.token,
        undefined,
        `e2e-lab-empty-${context.runId}.xlsx`,
      );
      const attachmentUrl = notified.data.presignedUrl;
      if (!attachmentUrl) {
        throw new Error("the uploaded workbook has no presigned URL");
      }
      const probe = await bugCheckpoint(
        "an-empty-worksheet-is-refused-with-its-translation-key",
        async () => {
          const imported = await rawRequest<ErrorBody & { id?: string }[]>(
            "POST",
            `/import/${baseId}`,
            {
              attachmentUrl,
              fileType: SUPPORTEDTYPE.EXCEL,
              worksheets: {
                Empty: {
                  name: `${config.tableNamePrefix}-${context.runId}`,
                  columns: [],
                  useFirstRowAsHeader: true,
                  importData: true,
                },
              },
              tz: "UTC",
            },
            headers,
          );
          const createdIds = Array.isArray(imported.data)
            ? (imported.data as { id?: string }[])
                .map((t) => t.id)
                .filter(Boolean)
            : [];
          tableIds.push(...(createdIds as string[]));
          return expectLocalized(
            "importing a worksheet with no columns",
            imported as RawResponse<ErrorBody>,
          );
        },
      );
      return { details: probe };
    }

    if (config.scenario === "share-auth-without-password") {
      const share = await rawRequest<{ shareId?: string }>(
        "POST",
        `/base/${baseId}/share`,
        {},
      );
      shareId = share.data?.shareId ?? "";
      if (!shareId) {
        throw new Error(`sharing the base answered ${describeResponse(share)}`);
      }
      const probe = await bugCheckpoint(
        "a-share-without-a-password-refuses-one-with-its-translation-key",
        async () =>
          expectLocalized(
            "submitting a password to a share that has none",
            await asAnonymous("POST", `/share/${shareId}/base/auth`, {
              password: config.password,
            }),
          ),
      );
      return { details: probe };
    }

    if (config.scenario === "reset-email-unregistered") {
      const probe = await bugCheckpoint(
        "an-unregistered-email-is-refused-with-its-translation-key",
        async () =>
          expectLocalized(
            "asking to reset the password of an unregistered email",
            await asAnonymous("POST", "/auth/send-reset-password-email", {
              email: `${config.tableNamePrefix}-${context.runId}@example.com`,
            }),
          ),
      );
      return { details: probe };
    }

    const probe = await bugCheckpoint(
      "an-invalid-reset-token-is-refused-with-its-translation-key",
      async () =>
        expectLocalized(
          "resetting a password with an invalid token",
          await asAnonymous("POST", "/auth/reset-password", {
            password: config.password,
            code: `invalid-${context.runId}`,
          }),
        ),
    );
    return { details: probe };
  } finally {
    if (shareId) {
      try {
        await rawRequest("DELETE", `/base/${baseId}/share/${shareId}`);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (share ${shareId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
