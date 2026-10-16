import { FieldKeyType, FieldType } from "@teable/core";
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
  SelectDefaultFollowsOptionsCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// Select columns whose default is one of their options -> rename that option,
// then delete it; and in a multi-select, delete every option the default
// names -> checkpoint: each edit is saved, the default follows the rename and
// is cleared with the deletion, and a new row can still be created.
//
// Tidying up a column's options is routine - fixing a typo, retiring a
// status. The default pointed at the option by name, so renaming it left a
// default naming an option that no longer existed, and every later save of
// the column was refused ("defaultValue must match an option name") until
// someone noticed the default and fixed it by hand. Deleting the options a
// multi-select default named left an empty list behind as the default.
//
// Every edit sends the choices only, the way an editor that never touched the
// default does.

const NAME_FIELD = "Name";
const SINGLE_FIELD = "Status";
const MULTI_FIELD = "Tags";

interface Choice {
  id: string;
  name: string;
  color: string;
}

export const runSelectDefaultFollowsOptionsCase = async (
  bugCase: BugCaseFor<"select-default-follows-options">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SelectDefaultFollowsOptionsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const [first, second] = config.singleChoices;
  const multiDefault = config.multiChoices.slice(0, -1);
  const multiKept = config.multiChoices.slice(-1);
  if (!first || !second || multiDefault.length < 2) {
    throw new Error(
      "the single select needs two options, and the multi-select a default of at least two with one option outside it",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: SINGLE_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: config.singleChoices.map((name) => ({ name })),
            defaultValue: first,
          },
        },
        {
          name: MULTI_FIELD,
          type: FieldType.MultipleSelect,
          options: {
            choices: config.multiChoices.map((name) => ({ name })),
            defaultValue: multiDefault,
          },
        },
      ],
      records: [],
    });
    tableIds.push(table.id);
    const fieldId = (name: string) =>
      table.fields.find((field: { name: string }) => field.name === name)?.id;
    const singleId = fieldId(SINGLE_FIELD);
    const multiId = fieldId(MULTI_FIELD);
    if (!singleId || !multiId) {
      throw new Error(`table ${table.id} is not in place`);
    }
    const options = async (id: string) =>
      ((await getField(table.id, id)).options ?? {}) as {
        choices?: Choice[];
        defaultValue?: unknown;
      };
    const singleChoices = (await options(singleId)).choices ?? [];
    const multiChoices = (await options(multiId)).choices ?? [];
    if (
      (await options(singleId)).defaultValue !== first ||
      JSON.stringify((await options(multiId)).defaultValue) !==
        JSON.stringify(multiDefault)
    ) {
      throw new Error("the defaults did not land as configured");
    }
    const patchChoices = (id: string, choices: Choice[]) =>
      rawRequest("PATCH", `/table/${table.id}/field/${id}`, {
        options: { choices },
      });
    const renamed = `${first} ${config.renameSuffix}`;

    const probe = await bugCheckpoint(
      "a-select-default-follows-its-options",
      async () => {
        const steps: Record<string, unknown> = {};
        const rename = await patchChoices(
          singleId,
          singleChoices.map((choice) =>
            choice.name === first ? { ...choice, name: renamed } : choice,
          ),
        );
        if (!isSuccess(rename)) {
          throw new Error(
            `renaming the default option answered ${describeResponse(rename)}`,
          );
        }
        const routing = assertServedByV2(rename.headers, {
          operation: "PATCH /table/{tableId}/field/{fieldId}",
          feature: "updateField",
        });
        steps.afterRename = (await options(singleId)).defaultValue ?? null;
        if (steps.afterRename !== renamed) {
          throw new Error(
            `after renaming ${first} to ${renamed} the default reads ${JSON.stringify(steps.afterRename)}`,
          );
        }

        const removeSingle = await patchChoices(
          singleId,
          ((await options(singleId)).choices ?? []).filter(
            (choice) => choice.name !== renamed,
          ),
        );
        if (!isSuccess(removeSingle)) {
          throw new Error(
            `deleting the default option answered ${describeResponse(removeSingle)}`,
          );
        }
        steps.afterDelete = (await options(singleId)).defaultValue ?? null;
        if (steps.afterDelete !== null) {
          throw new Error(
            `after deleting the default option the default reads ${JSON.stringify(steps.afterDelete)}, expected none`,
          );
        }

        const removeMulti = await patchChoices(
          multiId,
          multiChoices.filter((choice) => multiKept.includes(choice.name)),
        );
        if (!isSuccess(removeMulti)) {
          throw new Error(
            `deleting every default option of the multi-select answered ${describeResponse(removeMulti)}`,
          );
        }
        const multiAfter = await options(multiId);
        steps.multiDefault = multiAfter.defaultValue ?? null;
        if (multiAfter.defaultValue != null) {
          throw new Error(
            `after deleting every option the multi-select default named, the default reads ${JSON.stringify(multiAfter.defaultValue)}, expected none`,
          );
        }

        const created = await rawRequest<{ records?: { id: string }[] }>(
          "POST",
          `/table/${table.id}/record`,
          {
            fieldKeyType: FieldKeyType.Name,
            records: [{ fields: { [NAME_FIELD]: "new-row" } }],
          },
        );
        const newId = created.data?.records?.[0]?.id;
        if (!isSuccess(created) || !newId) {
          throw new Error(
            `creating a row after the edits answered ${describeResponse(created)}`,
          );
        }
        const row = (await getRecord(table.id, newId)).fields;
        steps.newRow = {
          single: row[singleId] ?? null,
          multi: row[multiId] ?? null,
        };
        if (row[singleId] != null || row[multiId] != null) {
          throw new Error(
            `a new row picked up ${JSON.stringify(steps.newRow)} from defaults that should be gone`,
          );
        }
        return { routing, steps };
      },
    );

    return { details: { tableId: table.id, steps: probe.steps } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
