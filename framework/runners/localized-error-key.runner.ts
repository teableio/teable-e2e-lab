import { FieldType, Relationship } from "@teable/core";
import { createAxios, PASTE_BY_ID_URL, urlBuilder } from "@teable/openapi";
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
  const asAnonymous = async (
    method: "POST",
    url: string,
    data: unknown,
  ): Promise<RawResponse<ErrorBody>> => {
    const response = await anonymous.request({
      method,
      url,
      data,
      headers,
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
