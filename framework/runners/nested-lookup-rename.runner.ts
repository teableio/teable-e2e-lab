import { Colors, FieldType, Relationship } from "@teable/core";
import {
  convertField,
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NestedLookupRenameCaseConfig } from "../types";

// A status column carried across two tables by lookups -> rename the last one
// -> checkpoint: it still knows its choices.
//
// A single-select field is its choices: the list somebody picked, in the
// colors they picked. A lookup of one carries that list along, and a lookup of
// that lookup carries it again - which is how a status set on one table shows
// up, with its colors, on a table two links away.
//
// Renaming the last column dropped the list. The cells keep their values, so
// nothing looks broken until someone opens the filter dropdown and finds it
// empty, or notices the colors are gone. Renaming a column is about as safe an
// edit as the product offers, which is what makes this one worth guarding.
//
// The rename sends an empty choices list, because that is what a client that
// does not manage the choices sends: they belong to the field this one is
// looking up, and the request is only changing the name.

const NAME_FIELD = "Name";
const SOURCE_SELECT = "Source Status";
const MIDDLE_LINK = "Middle Link";
const MIDDLE_LOOKUP = "Middle Status";
const HOST_LINK = "Host Link";
const NESTED_LOOKUP = "Nested Status";

export const runNestedLookupRenameCase = async (
  bugCase: BugCaseFor<"nested-lookup-rename">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NestedLookupRenameCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.choiceNames.length < 2) {
    throw new Error(
      "at least two choices - a single-choice list losing its colors and a list losing everything are " +
        "hard to tell apart",
    );
  }

  const palette = [Colors.BlueBright, Colors.GreenBright, Colors.OrangeBright];

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: SOURCE_SELECT,
          type: FieldType.SingleSelect,
          options: {
            choices: config.choiceNames.map((name, index) => ({
              name,
              color: palette[index % palette.length],
            })),
          },
        },
      ],
      records: [{ fields: { [NAME_FIELD]: "source-row" } }],
    });
    createdTableIds.unshift(sourceTable.id);
    const sourceSelect = sourceTable.fields.find(
      (field: { name: string }) => field.name === SOURCE_SELECT,
    );
    if (!sourceSelect) {
      throw new Error(`Source table ${sourceTable.id} is not in place`);
    }
    const expectedChoices = (sourceSelect.options?.choices ?? []).map(
      (choice: { name: string; color: string }) => ({
        name: choice.name,
        color: choice.color,
      }),
    );

    const middleTable = await createTable(baseId, {
      name: `${suffix}-middle`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "middle-row" } }],
    });
    createdTableIds.unshift(middleTable.id);
    const middleLink = await createField(middleTable.id, {
      name: MIDDLE_LINK,
      type: FieldType.Link,
      options: {
        foreignTableId: sourceTable.id,
        relationship: Relationship.ManyOne,
      },
    });
    const middleLookup = await createField(middleTable.id, {
      name: MIDDLE_LOOKUP,
      type: FieldType.SingleSelect,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sourceTable.id,
        lookupFieldId: sourceSelect.id,
        linkFieldId: middleLink.id,
      },
    });

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "host-row" } }],
    });
    createdTableIds.unshift(hostTable.id);
    const hostLink = await createField(hostTable.id, {
      name: HOST_LINK,
      type: FieldType.Link,
      options: {
        foreignTableId: middleTable.id,
        relationship: Relationship.ManyOne,
      },
    });
    const nestedLookup = await createField(hostTable.id, {
      name: NESTED_LOOKUP,
      type: FieldType.SingleSelect,
      isLookup: true,
      lookupOptions: {
        foreignTableId: middleTable.id,
        lookupFieldId: middleLookup.id,
        linkFieldId: hostLink.id,
      },
    });

    // Fixture verification, outside the checkpoint: the choices really did
    // travel two links. If they had not, "the rename lost them" would be about
    // a list that was never there.
    const asPairs = (choices: unknown) =>
      JSON.stringify(
        ((choices ?? []) as { name: string; color: string }[]).map(
          (choice) => ({
            name: choice.name,
            color: choice.color,
          }),
        ),
      );
    if (asPairs(nestedLookup.options?.choices) !== asPairs(expectedChoices)) {
      throw new Error(
        `the nested column starts with ${asPairs(nestedLookup.options?.choices)}, expected the source's ` +
          `${asPairs(expectedChoices)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "renaming-a-nested-lookup-keeps-its-choices",
      async () => {
        const updated = await convertField(hostTable.id, nestedLookup.id, {
          name: config.renamedTo,
          type: FieldType.SingleSelect,
          isLookup: true,
          // Empty, because a client that is only renaming the column sends what
          // it manages - and it does not manage these; they belong to the field
          // being looked up.
          options: { choices: [] },
          lookupOptions: {
            foreignTableId: middleTable.id,
            lookupFieldId: middleLookup.id,
            linkFieldId: hostLink.id,
          },
        });
        if (updated.name !== config.renamedTo) {
          throw new Error(
            `the column is named ${JSON.stringify(updated.name)} after the rename, expected ` +
              `${JSON.stringify(config.renamedTo)}`,
          );
        }
        if (asPairs(updated.options?.choices) !== asPairs(expectedChoices)) {
          throw new Error(
            `renaming the column left it with ${asPairs(updated.options?.choices)}, expected the choices it ` +
              `was carrying: ${asPairs(expectedChoices)}`,
          );
        }
        return { choices: updated.options?.choices };
      },
    );

    return {
      details: {
        sourceTableId: sourceTable.id,
        middleTableId: middleTable.id,
        hostTableId: hostTable.id,
        expectedChoices,
        choicesAfterRename: probe.choices,
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
