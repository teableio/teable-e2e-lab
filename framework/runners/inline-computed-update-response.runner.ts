import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecord as apiGetRecord,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { InlineComputedUpdateResponseCaseConfig } from "../types";

// A row with a formula over one of its own cells -> change that cell ->
// checkpoint: the answer to that write already carries the recomputed formula.
//
// Whoever made the write reads the answer and uses it: the cell the grid
// repaints, the number an automation carries into its next step, the row an
// integration writes into its own store. A stale formula in that answer is not
// a display lag - it is a wrong number handed to the caller as the result of
// their own write.
//
// The stale value is also plausible. A commission that should have gone to
// zero comes back as the old commission, so nothing about it looks like a
// failure.
//
// After the checkpoint the runner reads the row again. That separates "the
// formula never recomputed" from "it recomputed but the answer to the write
// did not say so" - two different failures that look the same from the write
// alone.

const NAME_FIELD = "Name";
const SOURCE_FIELD = "Price";
const FORMULA_FIELD = "Commission";

export const runInlineComputedUpdateResponseCase = async (
  bugCase: BugCaseFor<"inline-computed-update-response">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: InlineComputedUpdateResponseCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.priceBefore === config.priceAfter) {
    throw new Error(
      "the edit has to change the cell, or the old formula value and the new one are the same number",
    );
  }

  const expectedBefore = config.priceBefore * config.multiplier;
  const expectedAfter = config.priceAfter * config.multiplier;

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SOURCE_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "the-row",
            [SOURCE_FIELD]: config.priceBefore,
          },
        },
      ],
    });
    tableId = table.id;
    const recordId = table.records[0]?.id;
    const sourceFieldId = table.fields.find(
      (field: { name: string }) => field.name === SOURCE_FIELD,
    )?.id;
    if (!recordId || !sourceFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const formulaField = await createField(tableId, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${sourceFieldId}} * ${config.multiplier}` },
    });

    // Fixture verification, outside the checkpoint: the formula computes at
    // all, and it computes the old value. Without this a formula that is
    // simply empty would satisfy nothing and look like the bug.
    const initial = await apiGetRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
    });
    const initialValue = initial.data.fields[formulaField.id];
    if (initialValue !== expectedBefore) {
      throw new Error(
        `before the edit the formula holds ${JSON.stringify(initialValue)}, expected ${expectedBefore} - the ` +
          "fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "the-answer-to-a-write-carries-the-recomputed-formula",
      async () => {
        const response = await apiUpdateRecord(tableId, recordId, {
          fieldKeyType: FieldKeyType.Id,
          record: { fields: { [sourceFieldId]: config.priceAfter } },
        });
        const routing = assertServedByV2(response.headers, {
          operation: "PATCH /table/{tableId}/record/{recordId}",
          feature: "updateRecord",
        });

        const written = response.data.fields[sourceFieldId];
        if (written !== config.priceAfter) {
          throw new Error(
            `the edited cell came back as ${JSON.stringify(written)}, expected ${config.priceAfter} - the ` +
              "write itself did not take",
          );
        }

        const computed = response.data.fields[formulaField.id];
        if (computed !== expectedAfter) {
          throw new Error(
            `the answer to the write carries ${JSON.stringify(computed)} for ${FORMULA_FIELD}, expected ` +
              `${expectedAfter}` +
              (computed === expectedBefore
                ? ` - the value from before the edit, handed back as the result of the edit`
                : "") +
              " - whoever made the write uses this number",
          );
        }
        return { routing, computed };
      },
    );

    // Diagnostic, after the checkpoint: what the row settles to. Legal to read
    // here, and it is what tells the two failures apart when the case is red.
    const settled = await apiGetRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
    });

    return {
      details: {
        tableId,
        recordId,
        expectedAfter,
        inResponse: probe.computed,
        settledTo: settled.data.fields[formulaField.id],
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
