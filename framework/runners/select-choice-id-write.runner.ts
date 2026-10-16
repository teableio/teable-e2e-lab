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
  SelectChoiceIdWriteCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A single select with two options -> write one option's internal id as the
// cell value, first without typecast, then with it -> checkpoint: without
// typecast the write is refused and the cell stays empty; with typecast the
// id is taken as the text it is, becoming a new option of that name.
//
// A select cell is written by option NAME. An option id is an internal handle
// that leaks into clients through exports and API responses, and a write
// carrying one has to be treated like any other text: refused when the
// client asked for exact values, turned into an option when it asked for
// conversion. Resolving the id to the option behind it instead made writes
// depend on a handle nobody can see, and made the same text mean different
// things depending on whether it happened to collide with an id.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";

export const runSelectChoiceIdWriteCase = async (
  bugCase: BugCaseFor<"select-choice-id-write">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SelectChoiceIdWriteCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const [targetChoice] = config.choices;
  if (!targetChoice || config.choices.length < 2) {
    throw new Error("the select needs at least two options");
  }

  try {
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
      records: [
        { fields: { [NAME_FIELD]: "exact" } },
        { fields: { [NAME_FIELD]: "typecast" } },
      ],
    });
    tableIds.push(table.id);
    const statusId = table.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    )?.id;
    if (!statusId) {
      throw new Error(`table ${table.id} has no ${STATUS_FIELD} column`);
    }
    const choices = async () =>
      (
        (await getField(table.id, statusId)).options as {
          choices?: { id: string; name: string }[];
        }
      )?.choices ?? [];
    const choiceId = (await choices()).find(
      (choice) => choice.name === targetChoice,
    )?.id;
    if (!choiceId) {
      throw new Error(`option ${targetChoice} has no id`);
    }
    const [exactRowId, typecastRowId] = table.records.map(
      (record: { id: string }) => record.id,
    );
    const write = (recordId: string, typecast: boolean) =>
      rawRequest("PATCH", `/table/${table.id}/record/${recordId}`, {
        fieldKeyType: FieldKeyType.Id,
        ...(typecast ? { typecast: true } : {}),
        record: { fields: { [statusId]: choiceId } },
      });

    const probe = await bugCheckpoint(
      "an-option-id-written-to-a-select-is-only-text",
      async () => {
        const problems: string[] = [];
        const exact = await write(exactRowId, false);
        const exactCell =
          (await getRecord(table.id, exactRowId)).fields[statusId] ?? null;
        if (exact.status !== 400 || exactCell !== null) {
          problems.push(
            `without typecast the id write answered ${describeResponse(exact)} and the cell reads ${JSON.stringify(exactCell)}, ` +
              "expected a 400 refusal and an empty cell",
          );
        }
        const namesAfterExact = (await choices()).map((choice) => choice.name);
        if (
          JSON.stringify(namesAfterExact) !== JSON.stringify(config.choices)
        ) {
          problems.push(
            `the refused write changed the options to ${JSON.stringify(namesAfterExact)}`,
          );
        }

        const cast = await write(typecastRowId, true);
        if (!isSuccess(cast)) {
          problems.push(
            `with typecast the id write answered ${describeResponse(cast)}`,
          );
        } else {
          assertServedByV2(cast.headers, {
            operation: "PATCH /table/{tableId}/record/{recordId}",
            feature: "updateRecord",
          });
          const castCell =
            (await getRecord(table.id, typecastRowId)).fields[statusId] ?? null;
          const names = (await choices()).map((choice) => choice.name);
          if (castCell !== choiceId) {
            problems.push(
              `with typecast the cell reads ${JSON.stringify(castCell)}, expected the id taken as text (${choiceId})`,
            );
          }
          if (!names.includes(choiceId)) {
            problems.push(
              `with typecast no option named ${choiceId} was added; options are ${JSON.stringify(names)}`,
            );
          }
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { choiceId };
      },
    );

    return { details: { tableId: table.id, choiceId: probe.choiceId } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
