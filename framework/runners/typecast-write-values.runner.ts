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
  TypecastWriteValuesCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A column with a declared shape -> create a row through the API with a text
// value and typecast on, the way imports and integrations send data ->
// checkpoint: the row holds the value the column's own rules make of that
// text, and the column gained exactly the options that value needs.
//
// Typecast is the path every import and every no-code integration takes, so
// a misread here is repeated on every row they send - and it answers 201 every
// time. The shapes this guards: a date written in the column's own format
// ("04/03/2024" in a day-first column) read month-first, so the fourth of
// March lands in April; and a multi-select value whose option names contain a
// comma ("\"A, B\", C") split on every comma, so the row gets three options
// where two were sent and the column is littered with fragments nobody named.

const NAME_FIELD = "Name";
const TARGET_FIELD = "Target";

const normalise = (value: unknown) => (value === undefined ? null : value);

export const runTypecastWriteValuesCase = async (
  bugCase: BugCaseFor<"typecast-write-values">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TypecastWriteValuesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: TARGET_FIELD,
          type: config.field.type,
          ...(config.field.options ? { options: config.field.options } : {}),
        },
      ],
      records: [],
    });
    tableIds.push(table.id);
    const targetId = table.fields.find(
      (field: { name: string }) => field.name === TARGET_FIELD,
    )?.id;
    if (!targetId) {
      throw new Error(`table ${table.id} has no ${TARGET_FIELD} column`);
    }
    const choiceNames = async () =>
      (
        (
          (await getField(table.id, targetId)).options as {
            choices?: { name: string }[];
          }
        )?.choices ?? []
      ).map((choice) => choice.name);
    const choicesBefore = await choiceNames();

    const probe = await bugCheckpoint(
      "a-typecast-value-lands-as-the-column-reads-it",
      async () => {
        const created = await rawRequest<{ records?: { id: string }[] }>(
          "POST",
          `/table/${table.id}/record`,
          {
            fieldKeyType: FieldKeyType.Id,
            typecast: true,
            records: [{ fields: { [targetId]: config.input } }],
          },
        );
        const recordId = created.data?.records?.[0]?.id;
        if (!isSuccess(created) || !recordId) {
          throw new Error(
            `writing ${JSON.stringify(config.input)} with typecast answered ${describeResponse(created)}`,
          );
        }
        const routing = assertServedByV2(created.headers, {
          operation: "POST /table/{tableId}/record",
          feature: "createRecord",
        });
        const stored = normalise(
          (await getRecord(table.id, recordId)).fields[targetId],
        );
        const problems: string[] = [];
        if (JSON.stringify(stored) !== JSON.stringify(config.expectedValue)) {
          problems.push(
            `${JSON.stringify(config.input)} landed as ${JSON.stringify(stored)}, expected ${JSON.stringify(config.expectedValue)}`,
          );
        }
        let choicesAfter: string[] | undefined;
        if (config.expectedNewChoices) {
          choicesAfter = await choiceNames();
          const added = choicesAfter.filter(
            (name) => !choicesBefore.includes(name),
          );
          if (
            JSON.stringify([...added].sort()) !==
            JSON.stringify([...config.expectedNewChoices].sort())
          ) {
            problems.push(
              `the column gained the options ${JSON.stringify(added)}, expected exactly ${JSON.stringify(config.expectedNewChoices)}`,
            );
          }
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { routing, stored, choicesAfter };
      },
    );

    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
