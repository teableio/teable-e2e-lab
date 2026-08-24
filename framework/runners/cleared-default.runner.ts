import { Colors, FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  createRecords as apiCreateRecords,
  CONVERT_FIELD,
  urlBuilder,
} from "@teable/openapi";
import {
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ClearedDefaultCaseConfig } from "../types";

// A column that fills new rows in with a value -> take that default away ->
// checkpoint: the change saves, and the next row created arrives empty.
//
// Setting a default and later removing it is one setting used twice. Removing
// it was refused on every column type except text: the dialog would not save,
// and the way out was to delete the column and build it again, taking its data
// and everything pointing at it along.
//
// The shipped `field/clearing-a-checkbox-default-saves` is the same edit on a
// checkbox. These are the other types people actually set defaults on: a
// status that starts at "Todo", a quantity that starts at 1, a date that
// starts today.
//
// The assertion goes past the saved setting to a row created afterwards. A
// build that answered 200, cleared the setting and still filled new rows in
// would be the same problem with a friendlier dialog.

const NAME_FIELD = "Name";
const SUBJECT_FIELD = "Subject";

const fieldDefinition = (config: ClearedDefaultCaseConfig) => {
  switch (config.column) {
    case "number":
      return {
        name: SUBJECT_FIELD,
        type: FieldType.Number,
        options: { defaultValue: config.numberDefault },
      };
    case "date":
      return {
        name: SUBJECT_FIELD,
        type: FieldType.Date,
        options: { defaultValue: config.dateDefault },
      };
    case "singleSelect":
      return {
        name: SUBJECT_FIELD,
        type: FieldType.SingleSelect,
        options: {
          choices: config.choices.map((name) => ({
            name,
            color: Colors.Blue,
          })),
          defaultValue: config.choices[0],
        },
      };
  }
};

export const runClearedDefaultCase = async (
  bugCase: BugCaseFor<"cleared-default">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ClearedDefaultCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const definition = fieldDefinition(config);

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        definition,
      ],
      records: [],
    });
    tableId = table.id;
    const subjectField = table.fields.find(
      (field: { name: string }) => field.name === SUBJECT_FIELD,
    );
    if (!subjectField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the column really starts
    // with a default, and a row created now really is filled in with it.
    // Clearing a default that was never applied would pass anywhere.
    const before = await getFields(tableId);
    const startingDefault = before.find(
      (field: { name: string }) => field.name === SUBJECT_FIELD,
    )?.options?.defaultValue;
    if (startingDefault === null || startingDefault === undefined) {
      throw new Error(
        `the column starts with no default - the fixture is not in place`,
      );
    }
    const filledIn = await apiCreateRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      records: [{ fields: { [NAME_FIELD]: config.rowBeforeTitle } }],
    });
    const valueBefore = filledIn.data.records[0]?.fields[SUBJECT_FIELD];
    if (valueBefore === null || valueBefore === undefined) {
      throw new Error(
        "a row created before the edit was not filled in with the default, so an empty row afterwards " +
          "proves nothing",
      );
    }

    const probe = await bugCheckpoint(
      "taking-a-default-away-saves-and-takes-effect",
      async () => {
        // Raw axios with the status open: this is the request that is refused
        // before the fix, and the generated client drops the response with it.
        const response = await axios.put(
          urlBuilder(CONVERT_FIELD, { tableId, fieldId: subjectField.id }),
          {
            name: SUBJECT_FIELD,
            type: definition.type,
            // Null is how "no default" is said: the value that was there is
            // being taken away, not replaced by another one.
            options: { ...definition.options, defaultValue: null },
          },
          { validateStatus: () => true },
        );
        const status = response.status;
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data ?? "");
        if (status < 200 || status >= 300) {
          throw new Error(
            `taking the default off a ${config.column} column answered ${status}: ${body}`,
          );
        }

        const after = await getFields(tableId);
        const saved = after.find(
          (field: { name: string }) => field.name === SUBJECT_FIELD,
        )?.options?.defaultValue;
        if (saved !== null && saved !== undefined) {
          throw new Error(
            `the request answered ${status} but the column still defaults to ${JSON.stringify(saved)}`,
          );
        }

        // And the row that comes next, which is what the setting is for.
        const created = await apiCreateRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          records: [{ fields: { [NAME_FIELD]: config.rowAfterTitle } }],
        });
        const valueAfter = created.data.records[0]?.fields[SUBJECT_FIELD];
        if (valueAfter !== null && valueAfter !== undefined) {
          throw new Error(
            `the default was cleared but a row created afterwards still arrives holding ` +
              `${JSON.stringify(valueAfter)}`,
          );
        }
        return {
          status,
          routing: pickRoutingHeaders(response.headers),
          saved: saved ?? null,
        };
      },
    );

    return {
      details: {
        tableId,
        column: config.column,
        startedWith: startingDefault,
        valueBefore,
        status: probe.status,
        routing: probe.routing,
        defaultAfter: probe.saved,
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
