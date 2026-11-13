import { FieldKeyType, FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  SelectChoiceNameLimitCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A single-select column with no options and two rows -> paste a value one
// character over the option-name limit into a cell, which would create a new
// option -> checkpoint: the paste is refused with a 400 whose message does not
// repeat the oversized value, no option is created and the cell stays empty.
// Pasting a value exactly at the limit into the other row is the control and
// must create the option.
//
// Creating a select column with an overlong option was already refused, but
// pasting creates options too, and that path stored them: the overlong option
// then broke the editor, filters and imports that render it, far from the
// paste that let it in.

const NAME = "Name";
const CHOICE = "Choice";

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
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: CHOICE,
          type: FieldType.SingleSelect,
          options: { choices: [] },
        },
      ],
      records: [
        { fields: { [NAME]: "row-1" } },
        { fields: { [NAME]: "row-2" } },
      ],
    });
    tableIds.push(table.id);
    const viewId = table.views[0].id;
    const choiceId = table.fields[1].id;
    const paste = (row: number, content: string) =>
      rawRequest("PATCH", `/table/${table.id}/selection/paste`, {
        viewId,
        ranges: [
          [1, row],
          [1, row],
        ],
        content,
      });
    const choiceNames = async () => {
      const field = await rawRequest<{
        options?: { choices?: { name: string }[] };
      }>("GET", `/table/${table.id}/field/${choiceId}`);
      return (field.data.options?.choices ?? []).map((choice) => choice.name);
    };

    const atLimit = "a".repeat(config.maxLength);
    const control = await paste(0, atLimit);
    if (!isSuccess(control) || !(await choiceNames()).includes(atLimit)) {
      throw new Error(
        `pasting an option name exactly at ${config.maxLength} characters did not create it: ${describeResponse(control)}`,
      );
    }

    const oversized = "b".repeat(config.maxLength + 1);
    const probe = await bugCheckpoint(
      "a-pasted-overlong-option-name-is-refused-clearly",
      async () => {
        const refused = await paste(1, oversized);
        const names = await choiceNames();
        const read = await rawRequest<{
          records: { fields: Record<string, unknown> }[];
        }>(
          "GET",
          `/table/${table.id}/record?viewId=${viewId}&fieldKeyType=${FieldKeyType.Id}`,
        );
        const cell = read.data.records?.[1]?.fields[choiceId] ?? null;
        const problems: string[] = [];
        if (refused.status !== 400) {
          problems.push(`answered ${refused.status}, expected 400`);
        }
        if (names.includes(oversized)) problems.push("the option was created");
        if (cell !== null) problems.push("the cell holds the value");
        if (JSON.stringify(refused.data ?? "").includes(oversized)) {
          problems.push("the error repeats the whole oversized value");
        }
        if (problems.length > 0) {
          throw new Error(
            `pasting a ${config.maxLength + 1}-character option name: ${problems.join("; ")} (${describeResponse(refused).slice(0, 200)})`,
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
