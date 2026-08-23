import { FieldType } from "@teable/core";
import { axios, CONVERT_FIELD, urlBuilder } from "@teable/openapi";
import {
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CheckboxClearedDefaultCaseConfig } from "../types";

// A checkbox that defaults to ticked -> clear that default -> checkpoint: the
// change saves, and the default is gone.
//
// Turning a default off is the same edit as turning it on, and the way to say
// "no default" is to send nothing where the value was. The field's own schema
// only accepted true or false, so clearing it was refused: the dialog would
// not save, and the only way out was to delete the column and make it again.
//
// The assertion is the saved field rather than the status code. A request that
// answered 200 and kept the default would be the same column with a friendlier
// error, and the next row created would still arrive ticked.

const NAME_FIELD = "Name";
const CHECKBOX_FIELD = "Done";

export const runCheckboxClearedDefaultCase = async (
  bugCase: BugCaseFor<"checkbox-cleared-default">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CheckboxClearedDefaultCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: CHECKBOX_FIELD,
          type: FieldType.Checkbox,
          options: { defaultValue: config.startsTicked },
        },
      ],
      records: [],
    });
    tableId = table.id;
    const checkboxField = table.fields.find(
      (field: { name: string }) => field.name === CHECKBOX_FIELD,
    );
    if (!checkboxField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the column really starts
    // with a default. Clearing one that was never there would pass anywhere.
    const before = await getFields(tableId);
    const startingDefault = before.find(
      (field: { name: string }) => field.name === CHECKBOX_FIELD,
    )?.options?.defaultValue;
    if (startingDefault !== config.startsTicked) {
      throw new Error(
        `the column starts with defaultValue ${JSON.stringify(startingDefault)}, expected ` +
          `${JSON.stringify(config.startsTicked)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "clearing-a-checkbox-default-saves",
      async () => {
        // Raw axios with the status open: this is the request that is refused
        // before the fix, and the generated client drops the response with it.
        const response = await axios.put(
          urlBuilder(CONVERT_FIELD, {
            tableId,
            fieldId: checkboxField.id,
          }),
          {
            name: CHECKBOX_FIELD,
            type: FieldType.Checkbox,
            // Null is how "no default" is said: the value that was there is
            // being taken away, not replaced with false, which would mean
            // "defaults to unticked".
            options: { defaultValue: null },
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
            `clearing the checkbox's default answered ${status}: ${body}`,
          );
        }

        const after = await getFields(tableId);
        const saved = after.find(
          (field: { name: string }) => field.name === CHECKBOX_FIELD,
        )?.options?.defaultValue;
        if (saved !== null && saved !== undefined) {
          throw new Error(
            `the request answered ${status} but the column still defaults to ${JSON.stringify(saved)}`,
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
        startedWith: config.startsTicked,
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
