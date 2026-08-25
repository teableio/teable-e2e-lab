import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  createRecords as apiCreateRecords,
  DELETE_FIELD,
  OPERATION_UNDO,
  urlBuilder,
} from "@teable/openapi";
import {
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UndoFieldDeleteConstraintCaseConfig } from "../types";

// A column that refuses duplicates -> delete it by mistake -> undo ->
// checkpoint: it is back, and it still refuses duplicates.
//
// "No duplicates" is not a property of the column so much as a promise about
// the table: order numbers are unique, this invoice was not entered twice.
// Deleting the column by mistake and pressing undo is the most ordinary thing
// that can happen to it, and undo is the product saying nothing happened.
//
// The column came back without its promise. From then on the table quietly
// accepts the second copy of a row it used to refuse, and there is nothing on
// screen that differs: the column is there, in its place, with its values, and
// its settings are the only place the difference lives.
//
// So the case does not read the settings - it tries the thing the promise is
// about. A setting that reads as on while duplicates go in would be a worse
// green than a red.

const NAME_FIELD = "Name";
const CODE_FIELD = "Order number";

export const runUndoFieldDeleteConstraintCase = async (
  bugCase: BugCaseFor<"undo-field-delete-constraint">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UndoFieldDeleteConstraintCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  // The undo stack is keyed by this, so the delete and the undo have to carry
  // the same one - and a value reused across runs could hand this case an
  // entry it did not create.
  const windowId = `e2e-lab-undo-field-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
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
    const codeField = table.fields.find(
      (field: { name: string }) => field.name === CODE_FIELD,
    );
    if (!codeField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const addDuplicate = async (rowName: string) =>
      apiCreateRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        records: [
          {
            fields: {
              [table.fields[0].id]: rowName,
              [codeField.id]: config.code,
            },
          },
        ],
      }).then(
        (response) => ({ accepted: true, status: response.status }),
        (error: unknown) => ({
          accepted: false,
          message: error instanceof Error ? error.message : String(error),
        }),
      );

    // Fixture verification, outside the checkpoint: the promise holds before
    // anything is deleted. A column that never refused duplicates would make
    // the checkpoint unfalsifiable.
    const beforeDelete = await addDuplicate("the-duplicate-before");
    if (beforeDelete.accepted) {
      throw new Error(
        "the column accepts a second row with the same value before the delete - it is not refusing duplicates, so this case has nothing to ask",
      );
    }

    const probe = await bugCheckpoint(
      "undoing-a-column-delete-brings-its-promise-back",
      async () => {
        const deleted = await axios.delete(
          urlBuilder(DELETE_FIELD, { tableId, fieldId: codeField.id }),
          {
            headers: { "x-window-id": windowId },
            validateStatus: () => true,
          },
        );
        if (deleted.status < 200 || deleted.status >= 300) {
          throw new Error(
            `deleting the column answered ${deleted.status}: ${JSON.stringify(deleted.data)}`,
          );
        }

        const undone = await axios.post(
          urlBuilder(OPERATION_UNDO, { tableId }),
          undefined,
          {
            headers: { "x-window-id": windowId },
            validateStatus: () => true,
          },
        );
        if (undone.status < 200 || undone.status >= 300) {
          throw new Error(
            `undo answered ${undone.status}: ${JSON.stringify(undone.data)}`,
          );
        }

        // The column is back at all - otherwise "the promise is gone" would be
        // the wrong report for a column that simply did not return.
        const after = await getFields(tableId);
        const restored = after.find(
          (field: { name: string }) => field.name === CODE_FIELD,
        );
        if (!restored) {
          throw new Error(
            `undo did not bring the column back: the table holds ${JSON.stringify(after.map((field: { name: string }) => field.name))}`,
          );
        }

        // And the thing the promise is about.
        const afterUndo = await addDuplicate("the-duplicate-after");
        if (afterUndo.accepted) {
          throw new Error(
            `after undo the table accepted a second row holding ${JSON.stringify(config.code)} - ` +
              "the column is back in its place with its values and without the promise that it holds no duplicates",
          );
        }
        return { restoredFieldId: restored.id };
      },
    );

    return {
      details: {
        tableId,
        originalFieldId: codeField.id,
        restoredFieldId: probe.restoredFieldId,
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
