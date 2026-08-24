import { FieldType, Relationship } from "@teable/core";
import {
  getShareView as apiGetShareView,
  getShareViewRecords as apiGetShareViewRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkPickerPrimaryFieldCaseConfig } from "../types";

// A link column told to show only certain columns of the table it points at ->
// open the list of records to choose from -> checkpoint: the name column is
// there.
//
// "Show these columns in the picker" is how a link column is made readable:
// an order picker that also shows the amount, a person picker that also shows
// the team. Whoever configures it picks the extra columns and does not think
// to tick the name - the name is what a row is called, it is not an extra.
//
// Leaving it unticked took it out of the list. Every row in the picker is then
// identified by the extra column alone: three rows reading "42", "17", "42"
// and no way to tell which order is which. The link itself still works, so
// nothing is broken except the ability to choose.
//
// The unconfigured third column is the other half of the assertion: the picker
// must not answer with everything either, because the point of the setting is
// that it bounds what a share can read.

const NAME_FIELD = "Name";

export const runLinkPickerPrimaryFieldCase = async (
  bugCase: BugCaseFor<"link-picker-primary-field">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkPickerPrimaryFieldCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: config.shownFieldName, type: FieldType.SingleLineText },
        { name: config.hiddenFieldName, type: FieldType.SingleLineText },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [config.shownFieldName]: row.shown,
          [config.hiddenFieldName]: row.hidden,
        },
      })),
    });
    createdTableIds.unshift(foreign.id);
    const fieldId = (name: string) =>
      foreign.fields.find((field: { name: string }) => field.name === name)?.id;
    const primaryFieldId = fieldId(NAME_FIELD);
    const shownFieldId = fieldId(config.shownFieldName);
    const hiddenFieldId = fieldId(config.hiddenFieldName);
    if (!primaryFieldId || !shownFieldId || !hiddenFieldId) {
      throw new Error(`Table ${foreign.id} is not in place`);
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowTitle } }],
    });
    createdTableIds.unshift(host.id);

    // The setting under test: show one extra column, and do not tick the name.
    const linkField = await createField(host.id, {
      name: config.linkFieldName,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
        visibleFieldIds: [shownFieldId],
      },
    });

    const probe = await bugCheckpoint(
      "the-picker-still-says-what-each-row-is-called",
      async () => {
        // A link column's own id addresses the list of records to choose
        // from - the same view the picker draws.
        const picker = await apiGetShareView(linkField.id);
        const offered = picker.data.fields.map(
          (field: { id: string }) => field.id,
        );
        if (!offered.includes(primaryFieldId)) {
          throw new Error(
            `the picker offers ${JSON.stringify(offered)}, which does not include the name column ` +
              `${primaryFieldId} - every row in the list is identified by ${config.shownFieldName} alone`,
          );
        }
        if (offered.includes(hiddenFieldId)) {
          throw new Error(
            `the picker offers ${JSON.stringify(offered)}, which includes ${config.hiddenFieldName} - the ` +
              "setting is supposed to bound what the picker can read",
          );
        }

        // And in the rows themselves, asked for narrowly the way the picker
        // asks.
        const records = await apiGetShareViewRecords(linkField.id, {
          projection: [shownFieldId],
        });
        const withValues = records.data.records.find(
          (record: { fields: Record<string, unknown> }) =>
            record.fields[shownFieldId] !== undefined,
        );
        if (!withValues) {
          throw new Error(
            `no row in the picker carries ${config.shownFieldName} - the fixture is not in place`,
          );
        }
        if (withValues.fields[primaryFieldId] === undefined) {
          throw new Error(
            `a row in the picker carries ${JSON.stringify(withValues.fields)} - no name, so there is nothing ` +
              "to choose between the rows by",
          );
        }
        if (withValues.fields[hiddenFieldId] !== undefined) {
          throw new Error(
            `a row in the picker carries ${config.hiddenFieldName}, which the setting excludes`,
          );
        }
        return { offered };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        linkFieldId: linkField.id,
        offeredFields: probe.offered,
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
