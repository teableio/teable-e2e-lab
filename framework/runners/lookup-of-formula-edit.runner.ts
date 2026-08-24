import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  getFields as apiGetFields,
  UPDATE_FIELD,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupOfFormulaEditCaseConfig } from "../types";

// A column that looks up a formula on the table it links to -> edit that
// column -> checkpoint: the edit is accepted.
//
// Looking up a computed value across a link is ordinary: an order row showing
// the customer's calculated tier, a task showing its project's completion.
// The lookup column carried a copy of the foreign formula's expression, and
// that copy made the column fail its own validation whenever anything touched
// it. So the column worked - it displayed the right number - and could not be
// renamed, could not be re-pointed, could not be converted.
//
// A column nobody can edit is a small thing until the base needs
// reorganising, and then it is a column that has to be deleted and rebuilt,
// taking whatever depends on it along.
//
// The neighbouring plain lookup is the control: it is edited the same way in
// the same run, so "everything here is unfixable" is told apart from "this
// one is".

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const FOREIGN_FORMULA_FIELD = "Doubled";
const LINK_FIELD = "Order";
const LOOKUP_OF_FORMULA = "Doubled from the order";
const LOOKUP_OF_PLAIN = "Amount from the order";

export const runLookupOfFormulaEditCase = async (
  bugCase: BugCaseFor<"lookup-of-formula-edit">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupOfFormulaEditCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.foreignRowTitle,
            [AMOUNT_FIELD]: config.amount,
          },
        },
      ],
    });
    createdTableIds.unshift(foreign.id);
    const amountFieldId = foreign.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    const foreignPrimaryId = foreign.fields.find(
      (field: { isPrimary?: boolean }) => field.isPrimary,
    )?.id;
    if (!amountFieldId || !foreignPrimaryId) {
      throw new Error(`Table ${foreign.id} is not in place`);
    }

    const foreignFormula = await createField(foreign.id, {
      name: FOREIGN_FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${amountFieldId}} * 2` },
    });

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowTitle } }],
    });
    createdTableIds.unshift(host.id);

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });

    const lookupOfFormula = await createField(host.id, {
      name: LOOKUP_OF_FORMULA,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: foreign.id,
        linkFieldId: linkField.id,
        lookupFieldId: foreignFormula.id,
      },
    });

    // The control: the same kind of column, looking up a plain number instead
    // of a computed one.
    const lookupOfPlain = await createField(host.id, {
      name: LOOKUP_OF_PLAIN,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: foreign.id,
        linkFieldId: linkField.id,
        lookupFieldId: amountFieldId,
      },
    });

    // Control, outside the checkpoint: renaming the plain lookup works. If it
    // did not, the case would be reporting something about lookups in general.
    const controlRename = await axios.patch(
      urlBuilder(UPDATE_FIELD, {
        tableId: host.id,
        fieldId: lookupOfPlain.id,
      }),
      { name: `${LOOKUP_OF_PLAIN} renamed` },
      { validateStatus: () => true },
    );
    if (controlRename.status < 200 || controlRename.status >= 300) {
      throw new Error(
        `renaming the plain lookup answered ${controlRename.status}: ${JSON.stringify(controlRename.data)} - ` +
          "lookups cannot be renamed at all here, so this case would be reporting the wrong thing",
      );
    }

    const probe = await bugCheckpoint(
      "a-lookup-of-a-formula-can-still-be-edited",
      async () => {
        // Raw axios with the status open: the refusal carries a message
        // worth reporting, and the generated client throws it away.
        const response = await axios.patch(
          urlBuilder(UPDATE_FIELD, {
            tableId: host.id,
            fieldId: lookupOfFormula.id,
          }),
          { name: config.newName },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `renaming a lookup of a formula answered ${response.status}: ${JSON.stringify(response.data)} - ` +
              "the column displays the right number and cannot be edited",
          );
        }

        const fields = await apiGetFields(host.id, {
          fieldKeyType: FieldKeyType.Id,
        });
        const renamed = fields.data.find(
          (field: { id: string }) => field.id === lookupOfFormula.id,
        );
        if (renamed?.name !== config.newName) {
          throw new Error(
            `renaming the lookup was accepted but the column is still called ${JSON.stringify(renamed?.name)}`,
          );
        }
        return { name: renamed.name };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        lookupFieldId: lookupOfFormula.id,
        renamedTo: probe.name,
      },
    };
  } finally {
    for (const tableId of createdTableIds) {
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
