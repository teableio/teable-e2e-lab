import { Colors, FieldType, NumberFormattingType } from "@teable/core";
import { axios, CONVERT_FIELD, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NumberShowAsClearedCaseConfig } from "../types";

// A number column drawn as a bar -> switch it back to a plain number ->
// checkpoint: the bar is gone.
//
// "Show as" is how a number column stops being a number on screen and becomes a
// bar or a ring. Turning it off is the same menu, the other way: the settings
// are saved without it.
//
// The save was accepted and the bar stayed. Nothing reports a failure - the
// dialog closes, the column is still a bar, and the only thing the person can
// conclude is that they did it wrong. Doing it again does the same thing,
// because what is sent the second time is what was sent the first.
//
// The assertion is what the column says afterwards, read fresh. A request that
// answers 200 and changes nothing is precisely this bug, so the status alone
// says nothing.

const NAME_FIELD = "Name";
const NUMBER_FIELD = "Progress";

export const runNumberShowAsClearedCase = async (
  bugCase: BugCaseFor<"number-show-as-cleared">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NumberShowAsClearedCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    tableId = table.id;

    const formatting = {
      type: NumberFormattingType.Decimal,
      precision: config.precision,
    };
    const created = await createField(tableId, {
      name: NUMBER_FIELD,
      type: FieldType.Number,
      options: {
        formatting,
        showAs: {
          type: "bar",
          color: Colors.Green,
          showValue: true,
          maxValue: config.maxValue,
        },
      },
    });

    // Fixture verification, outside the checkpoint: the column really is drawn
    // as a bar before anything is changed. Clearing something that was never
    // there is a green checkpoint that means nothing.
    const before = (await getFields(tableId)).find(
      (field: { id: string }) => field.id === created.id,
    ) as { options?: { showAs?: unknown } } | undefined;
    if (!before?.options?.showAs) {
      throw new Error(
        `the column starts as ${JSON.stringify(before?.options ?? null)} - it is not drawn as a bar, so there is ` +
          "nothing for this case to turn off",
      );
    }

    const probe = await bugCheckpoint(
      "turning-off-a-bar-turns-it-off",
      async () => {
        // Null is how "no longer drawn as anything" is said: the settings
        // screen omits it, and the request that reaches the server carries the
        // absence explicitly.
        const response = await axios.put(
          urlBuilder(CONVERT_FIELD, { tableId, fieldId: created.id }),
          {
            name: NUMBER_FIELD,
            type: FieldType.Number,
            options: { formatting, showAs: null },
          },
          { validateStatus: () => true },
        );
        const routing = assertServedByV2(response.headers, {
          operation: "PUT /table/{tableId}/field/{fieldId}/convert",
          feature: "convertField",
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `turning the bar off answered ${response.status}: ${JSON.stringify(response.data)}`,
          );
        }

        const after = (await getFields(tableId)).find(
          (field: { id: string }) => field.id === created.id,
        ) as
          | { options?: { showAs?: unknown; formatting?: unknown } }
          | undefined;
        if (after?.options?.showAs) {
          throw new Error(
            `the request answered ${response.status} and the column is still drawn as ` +
              `${JSON.stringify(after.options.showAs)} - the settings screen closed on a change that was not made`,
          );
        }
        if (!after?.options?.formatting) {
          throw new Error(
            `turning the bar off took the number formatting with it: the column reads ${JSON.stringify(after?.options ?? null)}`,
          );
        }
        return { routing, status: response.status, options: after.options };
      },
    );

    return {
      details: {
        tableId,
        fieldId: created.id,
        convertStatus: probe.status,
        optionsAfter: probe.options,
        routing: probe.routing,
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
