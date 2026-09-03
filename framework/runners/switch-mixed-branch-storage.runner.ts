import { Colors, FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getFields as apiGetFields,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SwitchMixedBranchStorageCaseConfig } from "../types";

// A column that picks its value by case - this number for one kind of row, that
// number for another, and otherwise the linked records -> checkpoint: the column
// can be made, and it reads what each case says.
//
// Written out, the rule is "cost depends on where the cost comes from": a
// manually entered figure for some rows, a different figure for others, and for
// everything else whatever is linked. The first two answers are numbers. The
// last is a list of linked records, which is stored as a document rather than as
// a number.
//
// The step that merges the branches together compared only the ones with a
// case attached, and those agreed - both numbers - so it never looked at what
// the otherwise branch held. The database was then asked to choose between
// numbers and a document in one expression and refused outright, which killed
// the whole column: it could not be created, and the schema change it was part
// of died with it.
//
// The interface offers all of this. Nothing about the formula is unusual, and
// nothing says the last branch is a different kind of thing from the others.

const NAME_FIELD = "Name";
const PRICE_FIELD = "Price";
const BASIS_FIELD = "Cost basis";
const LINK_FIELD = "Prices";
const SWITCH_FIELD = "Cost";

export const runSwitchMixedBranchStorageCase = async (
  bugCase: BugCaseFor<"switch-mixed-branch-storage">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SwitchMixedBranchStorageCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.numberBranches.length < 2) {
    throw new Error(
      "two number branches at least - the branches with a case attached have to agree with each other, " +
        "or the step that merges them would have looked at the otherwise branch anyway",
    );
  }
  const basisChoices = [
    ...config.numberBranches.map((branch) => branch.choice),
    config.otherwiseChoice,
  ];
  if (new Set(basisChoices).size !== basisChoices.length) {
    throw new Error(
      `the cases are not distinct: ${JSON.stringify(basisChoices)}`,
    );
  }

  try {
    // The linked table. Its rows are what the otherwise branch reads, and a
    // many-valued link means that branch holds a list rather than one value -
    // which is what makes it a different kind of thing from the numbers.
    const prices = await createTable(baseId, {
      name: `${suffix}-prices`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: PRICE_FIELD, type: FieldType.Number },
      ],
      records: config.linkedRows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [PRICE_FIELD]: row.price },
      })),
    });
    createdTableIds.unshift(prices.id);
    const priceRowIds = prices.records.map(
      (record: { id: string }) => record.id,
    );

    const services = await createTable(baseId, {
      name: `${suffix}-services`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: BASIS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: basisChoices.map((name) => ({ name, color: Colors.Blue })),
          },
        },
        ...config.numberBranches.map((branch) => ({
          name: branch.column,
          type: FieldType.Number,
        })),
      ],
      records: [],
    });
    createdTableIds.unshift(services.id);
    const fieldId = (name: string) => {
      const found = services.fields.find(
        (field: { name: string }) => field.name === name,
      )?.id;
      if (!found) {
        throw new Error(`the services table has no ${name} column`);
      }
      return found as string;
    };
    const basisId = fieldId(BASIS_FIELD);
    const numberIds = config.numberBranches.map((branch) =>
      fieldId(branch.column),
    );

    const link = await createField(services.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        // Many-to-many so every row can hold the same list. One-to-many gives
        // each linked record a single parent, and the fixture needs several
        // rows - one per case - all reading a list.
        relationship: Relationship.ManyMany,
        foreignTableId: prices.id,
      },
    });

    // One row per case, each linked to the priced rows so the otherwise branch
    // has something to read.
    const rows = [
      ...config.numberBranches.map((branch, index) => ({
        name: `row-${branch.choice}`,
        basis: branch.choice,
        expected: branch.value,
        index,
      })),
      {
        name: `row-${config.otherwiseChoice}`,
        basis: config.otherwiseChoice,
        expected: null,
        index: -1,
      },
    ];
    await apiCreateRecords(services.id, {
      fieldKeyType: FieldKeyType.Id,
      typecast: false,
      records: rows.map((row) => ({
        fields: {
          [services.fields[0].id]: row.name,
          [basisId]: row.basis,
          ...Object.fromEntries(
            config.numberBranches.map((branch, index) => [
              numberIds[index],
              branch.value,
            ]),
          ),
          [link.id]: priceRowIds.map((id: string) => ({ id })),
        },
      })),
    });

    // Fixture verification, outside the checkpoint: the linked column really
    // holds a list. Holding one value, it would be the same kind of thing as
    // the numbers and there would be nothing to reconcile.
    const seeded = await apiGetRecords(services.id, {
      fieldKeyType: FieldKeyType.Id,
      take: rows.length,
    });
    const linkCell = seeded.data.records[0]?.fields[link.id];
    if (!Array.isArray(linkCell) || linkCell.length < 2) {
      throw new Error(
        `the linked column holds ${JSON.stringify(linkCell)} - the otherwise branch needs a list`,
      );
    }
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const cases = config.numberBranches
      .map((branch, index) => `"${branch.choice}", {${numberIds[index]}}`)
      .join(", ");
    const expression = `SWITCH({${basisId}}, ${cases}, {${link.id}})`;

    const probe = await bugCheckpoint(
      "a-column-that-picks-by-case-can-be-made",
      async () => {
        // The column is made HERE. Reconciling the branches happens while it is
        // built, so the refusal happens then - building it in setup would score
        // that as "this case could not run here" instead of as the bug.
        const made = await createField(services.id, {
          name: SWITCH_FIELD,
          type: FieldType.Formula,
          options: { expression },
        });

        const listed = await apiGetFields(services.id);
        const back = listed.data.find(
          (field: { id: string }) => field.id === made.id,
        ) as { hasError?: boolean } | undefined;
        if (back?.hasError) {
          throw new Error(
            `the column was created and immediately marked broken: ${expression}`,
          );
        }

        // And it reads what each case says, at least where the answer is a
        // number. A column that exists and computes nothing is the same outage
        // one step later.
        const after = await apiGetRecords(services.id, {
          fieldKeyType: FieldKeyType.Id,
          take: rows.length,
        });
        const byName = new Map(
          after.data.records.map((record) => [
            String(record.fields[services.fields[0].id]),
            record.fields[made.id] ?? null,
          ]),
        );
        const scene = Object.fromEntries(byName);
        for (const row of rows) {
          if (row.expected === null) {
            continue;
          }
          if (Number(byName.get(row.name)) !== row.expected) {
            throw new Error(
              `the row whose case is ${JSON.stringify(row.basis)} reads ` +
                `${JSON.stringify(byName.get(row.name))}, expected ${row.expected}. ` +
                `The column reads ${JSON.stringify(scene)}`,
            );
          }
        }
        return { fieldId: made.id, scene };
      },
    );

    return {
      details: {
        pricesTableId: prices.id,
        servicesTableId: services.id,
        expression,
        routing,
        ...probe,
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
