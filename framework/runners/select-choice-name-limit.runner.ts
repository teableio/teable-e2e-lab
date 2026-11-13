import { FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  SelectChoiceNameLimitCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A table -> a single-select column whose only option name is one character
// over the limit -> checkpoint: the request is refused with a 400 whose
// message says what is wrong without repeating the oversized name, and no
// such column exists. One exactly at the limit is the control and must be
// created.
//
// Overlong option names were stored, and then broke the places that render or
// index them later - the select editor, filters, imports - far from the
// request that let them in.

export const runSelectChoiceNameLimitCase = async (
  bugCase: BugCaseFor<"select-choice-name-limit">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SelectChoiceNameLimitCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.push(table.id);
    const select = (fieldName: string, choice: string) =>
      rawRequest("POST", `/table/${table.id}/field`, {
        name: fieldName,
        type: FieldType.SingleSelect,
        options: { choices: [{ name: choice }] },
      });

    const atLimit = await select("At limit", "a".repeat(config.maxLength));
    if (!isSuccess(atLimit)) {
      throw new Error(
        `an option name exactly at ${config.maxLength} characters was refused: ${describeResponse(atLimit)}`,
      );
    }

    const oversized = "b".repeat(config.maxLength + 1);
    const probe = await bugCheckpoint(
      "an-overlong-option-name-is-refused-clearly",
      async () => {
        const refused = await select("Over limit", oversized);
        const fields = await rawRequest<{ name: string }[]>(
          "GET",
          `/table/${table.id}/field`,
        );
        const saved = (fields.data ?? []).some(
          (field) => field.name === "Over limit",
        );
        const message = JSON.stringify(refused.data ?? "");
        const problems: string[] = [];
        if (refused.status !== 400) {
          problems.push(`answered ${refused.status}, expected 400`);
        }
        if (saved) problems.push("the column was created");
        if (message.includes(oversized)) {
          problems.push("the error repeats the whole oversized name");
        }
        if (problems.length > 0) {
          throw new Error(
            `a ${config.maxLength + 1}-character option name: ${problems.join("; ")} (${describeResponse(refused).slice(0, 200)})`,
          );
        }
        return { status: refused.status };
      },
    );
    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
