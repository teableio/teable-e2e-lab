import { FieldKeyType, FieldType, Role } from "@teable/core";
import {
  getRecords as apiGetRecords,
  PASTE_BY_ID_URL,
  urlBuilder,
} from "@teable/openapi";
import {
  createTable,
  getField,
  getRecord,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  EditorSelectAutocreateCaseConfig,
} from "../types";
import { dropTables } from "./raw-api";
import { signUpAndInvite } from "./second-person";

// A single select with fixed options, and a collaborator who may edit rows
// but not columns -> that collaborator writes a value that is not an option,
// through typecast or by pasting -> checkpoint: the column's options are
// unchanged and the cell does not hold the new value.
//
// Adding an option changes the column, and changing columns is exactly what
// this role was not given. Typecast and paste both create a missing option
// on the fly, and both did it without asking whether the person writing may
// change the column - so anyone allowed to edit rows could grow any select's
// option list, and the list a team curated to keep reports clean gained
// whatever was pasted into it.
//
// Fixed since 5255dd724 and shipped before this case was added; until then
// this would have been a public reproduction of a permission bypass, which
// CONTRIBUTING.md keeps out of this repository.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";

export const runEditorSelectAutocreateCase = async (
  bugCase: BugCaseFor<"editor-select-autocreate">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: EditorSelectAutocreateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  if (config.choices.includes(config.newValue)) {
    throw new Error("the written value has to be a new option");
  }

  try {
    const { client: editor } = await signUpAndInvite(
      `${config.tableNamePrefix}-${context.runId}@example.com`,
      Role.Editor,
    );
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: { choices: config.choices.map((name) => ({ name })) },
        },
      ],
      records: [{ fields: { [NAME_FIELD]: "row-1" } }],
    });
    tableIds.push(table.id);
    const statusId = table.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    )?.id;
    if (!statusId) {
      throw new Error(`table ${table.id} has no ${STATUS_FIELD} column`);
    }
    const recordId = table.records[0].id;
    const listed = await apiGetRecords(table.id, {});
    assertServedByV2(listed.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    // The editor can edit rows: an existing option goes in. Without this the
    // case could not tell "not allowed to add options" from "not allowed in".
    const allowed = await editor.patch(
      `/table/${table.id}/record/${recordId}`,
      {
        fieldKeyType: FieldKeyType.Id,
        record: { fields: { [statusId]: config.choices[0] } },
      },
      { validateStatus: () => true },
    );
    if (allowed.status < 200 || allowed.status >= 300) {
      throw new Error(
        `the editor could not write an existing option (${allowed.status}: ${JSON.stringify(allowed.data)})`,
      );
    }
    await editor.patch(`/table/${table.id}/record/${recordId}`, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [statusId]: null } },
    });

    const probe = await bugCheckpoint(
      config.scenario === "typecast"
        ? "an-editor-cannot-add-an-option-through-typecast"
        : "an-editor-cannot-add-an-option-by-pasting",
      async () => {
        const response =
          config.scenario === "typecast"
            ? await editor.patch(
                `/table/${table.id}/record/${recordId}`,
                {
                  fieldKeyType: FieldKeyType.Id,
                  typecast: true,
                  record: { fields: { [statusId]: config.newValue } },
                },
                { validateStatus: () => true },
              )
            : await editor.patch(
                urlBuilder(PASTE_BY_ID_URL, { tableId: table.id }),
                {
                  viewId: table.views[0].id,
                  selection: { recordIds: [recordId], fieldIds: [statusId] },
                  content: [[config.newValue]],
                },
                { validateStatus: () => true },
              );
        const names = (
          (
            (await getField(table.id, statusId)).options as {
              choices?: { name: string }[];
            }
          )?.choices ?? []
        ).map((choice) => choice.name);
        const cell =
          (await getRecord(table.id, recordId)).fields[statusId] ?? null;
        const problems: string[] = [];
        if (JSON.stringify(names) !== JSON.stringify(config.choices)) {
          problems.push(`the options became ${JSON.stringify(names)}`);
        }
        if (cell === config.newValue) {
          problems.push(`the cell now holds ${JSON.stringify(cell)}`);
        }
        if (problems.length > 0) {
          throw new Error(
            `an editor's ${config.scenario} of ${JSON.stringify(config.newValue)} answered ${response.status} and ${problems.join("; ")}`,
          );
        }
        return { status: response.status, names, cell };
      },
    );

    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
