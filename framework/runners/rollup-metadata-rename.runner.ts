import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  getField as apiGetField,
  getRecord as apiGetRecord,
  updateRecord as apiUpdateRecord,
  CONVERT_FIELD,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RollupMetadataRenameCaseConfig } from "../types";

// A rollup column on a table carried over from an older version -> change only
// its name and description -> checkpoint: the change is accepted and the
// number it holds is untouched.
//
// Renaming a column is the smallest edit there is. It said nothing about the
// values, so it should not have gone near them - but it recomputed the whole
// column anyway, and on a table whose storage predates the current layout that
// recompute cannot be written. The rename is refused, with a message about
// types that has nothing to do with what was asked.
//
// Which tables have that older storage is not visible from the product: two
// bases look identical and only one refuses the rename. That is the shape that
// makes it hard to report - it works for the person testing it.
//
// The older storage is made with SQL, because the product does not produce it
// on request any more; it is what tables migrated from the previous version
// carry.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const LINK_FIELD = "Source";
const ROLLUP_FIELD = "Total";

export const runRollupMetadataRenameCase = async (
  bugCase: BugCaseFor<"rollup-metadata-rename">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RollupMetadataRenameCaseConfig = bugCase.config;
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
      records: [],
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

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowTitle } }],
    });
    createdTableIds.unshift(host.id);
    const hostRecordId = host.records[0]?.id;
    if (!hostRecordId) {
      throw new Error(`Table ${host.id} is not in place`);
    }

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });

    // Rows on the far side, then linked to the host row, so the rollup holds
    // a number rather than nothing.
    const foreignRows = await createRecords(foreign.id, {
      fieldKeyType: FieldKeyType.Id,
      records: config.amounts.map((amount, index) => ({
        fields: {
          [foreignPrimaryId]: `${config.hostRowTitle}-${index + 1}`,
          [amountFieldId]: amount,
        },
      })),
    });
    await apiUpdateRecord(host.id, hostRecordId, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [linkField.id]: foreignRows.records.map((row: { id: string }) => ({
            id: row.id,
          })),
        },
      },
    });

    const rollupField = await createField(host.id, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: foreign.id,
        lookupFieldId: amountFieldId,
        linkFieldId: linkField.id,
      },
    });

    const detail = await apiGetField(host.id, rollupField.id);
    const before = await apiGetRecord(host.id, hostRecordId, {
      fieldKeyType: FieldKeyType.Id,
    });
    const valueBefore = before.data.fields[rollupField.id] ?? null;

    // Setup, outside the checkpoint: give the column the storage a table
    // carried over from the older version has. Nothing in the product produces
    // this any more, and nothing about it is visible from the product either.
    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(host.id);
    const column = await db.physicalColumn(rollupField.id);
    await db.execute(
      `ALTER TABLE "${physical.schema}"."${physical.table}" ` +
        `ALTER COLUMN "${column}" TYPE jsonb USING to_jsonb("${column}")`,
    );

    const probe = await bugCheckpoint(
      "renaming-a-rollup-does-not-touch-what-it-holds",
      async () => {
        // Only the name and the description change; everything else is sent
        // back exactly as it was read. Raw axios with the status open: the
        // refusal carries the message worth reporting.
        const response = await axios.put(
          urlBuilder(CONVERT_FIELD, {
            tableId: host.id,
            fieldId: rollupField.id,
          }),
          {
            name: config.renamedTo,
            description: config.newDescription,
            type: FieldType.Rollup,
            options: detail.data.options,
            lookupOptions: detail.data.lookupOptions,
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `renaming the rollup answered ${response.status}: ${JSON.stringify(response.data)} - the request ` +
              "said nothing about the values",
          );
        }

        const after = await apiGetRecord(host.id, hostRecordId, {
          fieldKeyType: FieldKeyType.Id,
        });
        const valueAfter = after.data.fields[rollupField.id] ?? null;
        if (JSON.stringify(valueAfter) !== JSON.stringify(valueBefore)) {
          throw new Error(
            `the rename was accepted but the total changed from ${JSON.stringify(valueBefore)} to ` +
              `${JSON.stringify(valueAfter)}`,
          );
        }
        return { status: response.status, valueAfter };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        rollupFieldId: rollupField.id,
        valueBefore,
        valueAfter: probe.valueAfter,
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
