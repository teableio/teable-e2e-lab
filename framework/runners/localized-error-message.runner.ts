import { FieldKeyType, FieldType } from "@teable/core";
import { axios, CREATE_RECORD, urlBuilder } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LocalizedErrorMessageCaseConfig } from "../types";

// A refused write, asked for in a second language -> checkpoint: the refusal
// comes back in that language.
//
// The message on a refused write is the whole of what a person gets: it is the
// only place the product explains what it will not do and why. A team working
// in their own language reads every other part of the interface in it, and
// then the one sentence that matters arrives in English.
//
// It is not a translation nicety. "This value is already used" is an
// instruction - go and find the other row - and a person who cannot read it
// has to guess, ask a colleague, or give up on the entry.
//
// The case never contains a translated string of its own. It asks for the same
// refusal twice, in two languages, and requires the two answers to differ:
// that holds whatever the translations say, and it cannot rot when the wording
// is improved.

const NAME_FIELD = "Name";
const CODE_FIELD = "Order number";

export const runLocalizedErrorMessageCase = async (
  bugCase: BugCaseFor<"localized-error-message">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LocalizedErrorMessageCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.otherLanguage === config.baseLanguage) {
    throw new Error(
      "two different languages - asking twice in the same one proves nothing",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CODE_FIELD, type: FieldType.SingleLineText, unique: true },
      ],
      records: [
        {
          fields: { [NAME_FIELD]: "the-first-row", [CODE_FIELD]: config.code },
        },
      ],
    });
    tableId = table.id;
    const codeFieldId = table.fields.find(
      (field: { name: string }) => field.name === CODE_FIELD,
    )?.id;
    if (!codeFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const refusedIn = async (language: string) => {
      const response = await axios.post(
        urlBuilder(CREATE_RECORD, { tableId }),
        {
          fieldKeyType: FieldKeyType.Id,
          records: [
            {
              fields: {
                [table.fields[0].id]: `a-second-row-${language}`,
                [codeFieldId]: config.code,
              },
            },
          ],
        },
        {
          headers: { "Accept-Language": language },
          validateStatus: () => true,
        },
      );
      const body = response.data as { message?: string };
      return { status: response.status, message: body?.message ?? "" };
    };

    // Fixture verification, outside the checkpoint: the write really is
    // refused, and the refusal says something. A request that succeeded, or
    // one that came back with no message at all, would leave the checkpoint
    // comparing nothing against nothing.
    const inBase = await refusedIn(config.baseLanguage);
    if (inBase.status < 400) {
      throw new Error(
        `a second row holding ${JSON.stringify(config.code)} was accepted (${inBase.status}) - the column is not refusing duplicates, so there is no refusal to read`,
      );
    }
    if (inBase.message.trim().length === 0) {
      throw new Error(
        `the refusal carries no message at all: ${JSON.stringify(inBase)}`,
      );
    }

    const probe = await bugCheckpoint(
      "a-refusal-arrives-in-the-language-it-was-asked-in",
      async () => {
        const inOther = await refusedIn(config.otherLanguage);
        if (inOther.status !== inBase.status) {
          throw new Error(
            `asking in ${config.otherLanguage} answered ${inOther.status} where ${config.baseLanguage} answered ${inBase.status} - ` +
              "the two requests are not being refused for the same reason",
          );
        }
        if (inOther.message.trim().length === 0) {
          throw new Error(
            `asking in ${config.otherLanguage} came back with no message: ${JSON.stringify(inOther)}`,
          );
        }
        if (inOther.message === inBase.message) {
          throw new Error(
            `the refusal reads the same in ${config.otherLanguage} as in ${config.baseLanguage}: ${JSON.stringify(inOther.message)} - ` +
              "the one sentence explaining what the product will not do arrives in a language the person may not read",
          );
        }
        return { status: inOther.status };
      },
    );

    return {
      details: {
        tableId,
        status: probe.status,
        baseLanguage: config.baseLanguage,
        otherLanguage: config.otherLanguage,
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
