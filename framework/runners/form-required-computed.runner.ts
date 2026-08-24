import { FieldKeyType, FieldType, ViewType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  FORM_SUBMIT,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormRequiredComputedCaseConfig } from "../types";

// A form whose settings mark an automatic column as required -> submit the
// form -> checkpoint: the submission goes through.
//
// Some columns are filled in by the product, not by the person: who created
// the row, when it was created, anything worked out from other columns. A form
// can end up with one of those marked required - the column was ordinary when
// the form was built and became automatic later, or the marking was carried
// over from an older version of the form.
//
// The submission is then refused for a column the person filling the form
// cannot see and could not fill in if they could. Every submission fails, and
// the form is the one part of a base used by people who cannot fix it: the
// customer, the applicant, the person at the other end of a link.
//
// The marking is written with SQL because the product no longer offers it -
// which is the same reason nobody can clear it from the form's own settings.

const NAME_FIELD = "Name";
const AUTOMATIC_FIELD = "Created by";

export const runFormRequiredComputedCase = async (
  bugCase: BugCaseFor<"form-required-computed">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormRequiredComputedCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AUTOMATIC_FIELD, type: FieldType.CreatedBy },
      ],
      views: [
        { name: `${suffix}-grid`, type: ViewType.Grid },
        { name: `${suffix}-form`, type: ViewType.Form },
      ],
      records: [],
    });
    tableId = table.id;
    const formView = table.views?.find(
      (view: { type: string }) => view.type === ViewType.Form,
    );
    const nameFieldId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id;
    const automaticFieldId = table.fields.find(
      (field: { name: string }) => field.name === AUTOMATIC_FIELD,
    )?.id;
    if (!formView?.id || !nameFieldId || !automaticFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Setup, outside the checkpoint: mark both columns required on the form,
    // including the one the product fills in itself. This is the state a form
    // is left in when a column becomes automatic after the form was built.
    const db = fixtureDb(context.app);
    await db.execute(
      `UPDATE "view" SET "column_meta" = $1 WHERE "id" = $2`,
      JSON.stringify({
        [nameFieldId]: { order: 0, visible: true, required: true },
        [automaticFieldId]: { order: 1, visible: true, required: true },
      }),
      formView.id,
    );

    const probe = await bugCheckpoint(
      "a-form-submits-when-an-automatic-column-is-marked-required",
      async () => {
        // Raw axios with the status open: the refusal is the report, and the
        // generated client throws the message away with it.
        const response = await axios.post(
          urlBuilder(FORM_SUBMIT, { tableId }),
          {
            viewId: formView.id,
            fields: { [nameFieldId]: config.submittedName },
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `submitting the form answered ${response.status}: ${JSON.stringify(response.data)} - the column ` +
              "it is asking for is one the person filling the form cannot see or fill in",
          );
        }

        // The row is the point of the form, so it has to be there with what
        // was typed into it.
        const rows = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          take: 2,
        });
        const submitted = rows.data.records.find(
          (record: { fields: Record<string, unknown> }) =>
            record.fields[nameFieldId] === config.submittedName,
        );
        if (!submitted) {
          throw new Error(
            `the form answered ${response.status} but no row holding ${JSON.stringify(config.submittedName)} ` +
              "is in the table",
          );
        }
        return { status: response.status, recordId: submitted.id };
      },
    );

    return {
      details: {
        tableId,
        formViewId: formView.id,
        submitStatus: probe.status,
        recordId: probe.recordId,
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
