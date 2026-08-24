import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupOfRollupCreateCaseConfig } from "../types";

// A column that looks up a total worked out on another table, whose stored
// settings have lost the rule for that total -> add a row anywhere in the
// chain -> checkpoint: the row is added.
//
// Chains like this are ordinary: adjustments roll up into an employee's
// highest rate, and a payroll line looks that rate up. The lookup at the end
// carries a copy of the totalling rule, and a column that has been converted
// back and forth can end up without it.
//
// From then on the tables stop working - not the column: adding a row, listing
// rows, opening the view, all refused with a message about a rule the user
// never wrote and cannot see. The three tables are fine individually; it is
// the chain that cannot be loaded.
//
// The missing rule is written with SQL because no request produces it, which
// is also why nobody can put it back from the interface.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const ROLLUP_FIELD = "Highest amount";
const LOOKED_UP_FIELD = "Highest amount, looked up";

export const runLookupOfRollupCreateCase = async (
  bugCase: BugCaseFor<"lookup-of-rollup-create">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupOfRollupCreateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    // The far end of the chain: rows carrying the numbers.
    const amounts = await createTable(baseId, {
      name: `${suffix}-amounts`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: [],
    });
    createdTableIds.unshift(amounts.id);
    const amountFieldId = amounts.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;

    // The middle: a total over those numbers.
    const owners = await createTable(baseId, {
      name: `${suffix}-owners`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.ownerTitle } }],
    });
    createdTableIds.unshift(owners.id);
    const ownerRecordId = owners.records[0]?.id;
    if (!amountFieldId || !ownerRecordId) {
      throw new Error("the fixture tables are not in place");
    }

    const ownerLink = await createField(owners.id, {
      name: "Amounts",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: amounts.id,
        isOneWay: false,
      },
    });
    const rollup = await createField(owners.id, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      options: { expression: "max({values})" },
      lookupOptions: {
        foreignTableId: amounts.id,
        linkFieldId: ownerLink.id,
        lookupFieldId: amountFieldId,
      },
    });

    // The near end: a column looking that total up.
    const usage = await createTable(baseId, {
      name: `${suffix}-usage`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.usageRowTitle } }],
    });
    createdTableIds.unshift(usage.id);
    const usageLink = await createField(usage.id, {
      name: "Owner",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: owners.id,
        isOneWay: false,
      },
    });
    const lookedUp = await createField(usage.id, {
      name: LOOKED_UP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: owners.id,
        linkFieldId: usageLink.id,
        lookupFieldId: rollup.id,
      },
    });

    // Fixture verification, outside the checkpoint: the chain works before it
    // is damaged.
    const before = await apiCreateRecords(amounts.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [amountFieldId]: config.firstAmount,
            [ownerLink.id]: undefined,
          },
        },
      ],
    });
    if (!before.data.records[0]?.id) {
      throw new Error("the chain refuses a row before it is damaged");
    }

    // Setup: the lookup keeps its shape but loses the totalling rule - what a
    // column converted back and forth can be left with.
    const db = fixtureDb(context.app);
    await db.execute(
      `UPDATE "field" SET "type" = 'rollup', "is_lookup" = true, "options" = $1 WHERE "id" = $2`,
      JSON.stringify({ formatting: { type: "decimal", precision: 0 } }),
      lookedUp.id,
    );

    const probe = await bugCheckpoint(
      "a-row-can-be-added-when-a-looked-up-total-lost-its-rule",
      async () => {
        // A refused create throws here, which is the report.
        const created = await apiCreateRecords(amounts.id, {
          fieldKeyType: FieldKeyType.Id,
          records: [{ fields: { [amountFieldId]: config.secondAmount } }],
        });
        const recordId = created.data.records[0]?.id;
        if (!recordId) {
          throw new Error("adding a row returned no row");
        }

        // And the tables still list, which is the other half of "the chain
        // cannot be loaded".
        const listed = await apiGetRecords(usage.id, {
          fieldKeyType: FieldKeyType.Name,
          take: 1,
        });
        if (listed.data.records.length !== 1) {
          throw new Error(
            `the table at the near end of the chain lists ${listed.data.records.length} rows, expected 1`,
          );
        }
        return { recordId };
      },
    );

    return {
      details: {
        amountsTableId: amounts.id,
        ownersTableId: owners.id,
        usageTableId: usage.id,
        addedRecordId: probe.recordId,
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
