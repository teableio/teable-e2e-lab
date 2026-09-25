import { FieldType, ViewType } from "@teable/core";
import {
  createField as apiCreateField,
  getViewList as apiGetViewList,
  updateViewColumnMeta as apiUpdateViewColumnMeta,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NewFieldInCustomizedViewCaseConfig } from "../types";

// A form that already hides a column -> add a new column to the table from
// somewhere else -> checkpoint: the form keeps the new column hidden, and a
// form that hides nothing shows it.
//
// A form someone has trimmed down - hiding the columns the public should not
// fill in - is a statement about what the form asks. Adding a column to the
// table for internal use then put it on that form, visible, the moment it was
// created. Nobody opens the form to check; the people filling it in see the
// new question first.
//
// The rule the product had kept: a view that hides anything keeps new columns
// hidden, a view that hides nothing shows them. The second form is the other
// half of that rule, and holds it in both directions - hiding every new column
// everywhere would pass the first half and fail this one.

const NAME_FIELD = "Name";
const INTERNAL_FIELD = "Internal notes";

type ColumnMeta = Record<string, { visible?: boolean } | undefined>;

export const runNewFieldInCustomizedViewCase = async (
  bugCase: BugCaseFor<"new-field-in-customized-view">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NewFieldInCustomizedViewCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const trimmedName = `${suffix}-trimmed-form`;
  const fullName = `${suffix}-full-form`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: INTERNAL_FIELD, type: FieldType.SingleLineText },
      ],
      views: [
        { name: `${suffix}-grid`, type: ViewType.Grid },
        { name: trimmedName, type: ViewType.Form },
        { name: fullName, type: ViewType.Form },
      ],
      records: [],
    });
    tableId = table.id;
    const internalFieldId = table.fields.find(
      (field: { name: string }) => field.name === INTERNAL_FIELD,
    )?.id;
    const trimmed = table.views?.find(
      (view: { name: string }) => view.name === trimmedName,
    );
    const full = table.views?.find(
      (view: { name: string }) => view.name === fullName,
    );
    if (!internalFieldId || !trimmed?.id || !full?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Trim one form: hide the internal column from it.
    await apiUpdateViewColumnMeta(tableId, trimmed.id, [
      { fieldId: internalFieldId, columnMeta: { visible: false } },
    ]);

    const readMeta = async () => {
      const views = (await apiGetViewList(tableId)).data;
      const metaOf = (viewId: string) =>
        (views.find((view) => view.id === viewId)?.columnMeta ??
          {}) as ColumnMeta;
      return { trimmed: metaOf(trimmed.id), full: metaOf(full.id) };
    };

    // Fixture verification, outside the checkpoint: the trimmed form hides
    // the internal column and the full form does not. Without that there is
    // no customised form for the new column to land in.
    const before = await readMeta();
    if (before.trimmed[internalFieldId]?.visible !== false) {
      throw new Error(
        `the trimmed form does not hide ${INTERNAL_FIELD}: ${JSON.stringify(before.trimmed)}`,
      );
    }
    if (before.full[internalFieldId]?.visible === false) {
      throw new Error(
        `the full form hides ${INTERNAL_FIELD} too: ${JSON.stringify(before.full)}`,
      );
    }

    // Add the new column the ordinary way - from the table, not from either
    // form.
    const created = await apiCreateField(tableId, {
      name: config.newFieldName,
      type: FieldType.SingleLineText,
    });
    const routing = assertServedByV2(created.headers, {
      operation: "POST /table/{tableId}/field",
      feature: "createField",
    });
    const newFieldId = created.data.id;

    const probe = await bugCheckpoint(
      "a-trimmed-form-keeps-a-new-column-hidden",
      async () => {
        const after = await readMeta();
        const onTrimmed = after.trimmed[newFieldId];
        const onFull = after.full[newFieldId];
        const problems: string[] = [];
        if (onTrimmed?.visible !== false) {
          problems.push(
            `the form that hides ${INTERNAL_FIELD} now shows the new column ${JSON.stringify(config.newFieldName)} ` +
              `(its entry reads ${JSON.stringify(onTrimmed ?? null)})`,
          );
        }
        if (after.trimmed[internalFieldId]?.visible !== false) {
          problems.push(
            `the form that hid ${INTERNAL_FIELD} no longer hides it: ${JSON.stringify(after.trimmed[internalFieldId] ?? null)}`,
          );
        }
        if (onFull?.visible !== true) {
          problems.push(
            `the form that hides nothing does not show the new column (its entry reads ${JSON.stringify(onFull ?? null)})`,
          );
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { onTrimmed, onFull };
      },
    );

    return {
      details: {
        tableId,
        routing,
        trimmedFormId: trimmed.id,
        fullFormId: full.id,
        newFieldId,
        newColumn: probe,
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
