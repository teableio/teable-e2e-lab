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

// A text column whose two rows hold a value exactly at the option-name limit
// and a value one character over it -> convert the column to a single select,
// which turns every distinct value into an option -> checkpoint: the
// conversion is refused with a 400 whose message does not repeat the
// oversized value, and the column is still text holding both values. Creating
// a select column with the at-limit option directly is the control.
//
// Creating a select column with an overlong option was already refused, but
// converting text creates options too, and that path stored them - or failed
// halfway: the overlong option then broke the editor, filters and imports that
// render it, far from the conversion that let it in.

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
    const atLimit = "a".repeat(config.maxLength);
    const oversized = "b".repeat(config.maxLength + 1);
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        { name: CHOICE, type: FieldType.SingleLineText },
      ],
      records: [
        { fields: { [NAME]: "row-1", [CHOICE]: atLimit } },
        { fields: { [NAME]: "row-2", [CHOICE]: oversized } },
      ],
    });
    tableIds.push(table.id);
    const choiceId = table.fields[1].id;

    const control = await rawRequest("POST", `/table/${table.id}/field`, {
      name: "At limit",
      type: FieldType.SingleSelect,
      options: { choices: [{ name: atLimit }] },
    });
    if (!isSuccess(control)) {
      throw new Error(
        `an option name exactly at ${config.maxLength} characters was refused: ${describeResponse(control)}`,
      );
    }

    const probe = await bugCheckpoint(
      "converting-to-an-overlong-option-name-is-refused-clearly",
      async () => {
        const refused = await rawRequest(
          "PUT",
          `/table/${table.id}/field/${choiceId}/convert`,
          { type: FieldType.SingleSelect },
        );
        const field = await rawRequest<{ type?: string }>(
          "GET",
          `/table/${table.id}/field/${choiceId}`,
        );
        const read = await rawRequest<{
          records: { fields: Record<string, unknown> }[];
        }>("GET", `/table/${table.id}/record?fieldKeyType=${FieldKeyType.Id}`);
        const values = (read.data.records ?? [])
          .map((record) => record.fields[choiceId])
          .sort();
        const problems: string[] = [];
        if (refused.status !== 400) {
          problems.push(`answered ${refused.status}, expected 400`);
        }
        if (field.data.type !== FieldType.SingleLineText) {
          problems.push(`the column became ${field.data.type}`);
        }
        if (JSON.stringify(values) !== JSON.stringify([atLimit, oversized])) {
          problems.push("the column no longer holds both values");
        }
        if (JSON.stringify(refused.data ?? "").includes(oversized)) {
          problems.push("the error repeats the whole oversized value");
        }
        if (problems.length > 0) {
          throw new Error(
            `converting text with a ${config.maxLength + 1}-character value to a single select: ${problems.join("; ")} (${describeResponse(refused).slice(0, 200)})`,
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
