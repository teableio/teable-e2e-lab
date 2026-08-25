import { Colors, FieldType, Relationship } from "@teable/core";
import { convertField as apiConvertField } from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupSelectChoicesKeptCaseConfig } from "../types";

// A column borrowing a choice column from another table -> point it through a
// different link -> checkpoint: it still offers the choices.
//
// A choice column is its choices. They are what the cell draws, what a filter
// lists, and what a person picks from; a choice column with no choices is a
// column nobody can use and a filter with nothing to select.
//
// Repointing which link a borrowed column travels along is an ordinary edit -
// the same information reached a different way, after the tables were
// rearranged. It wiped the choices. The column keeps its name and its place,
// the cells keep their text, and everything built on the choices stops
// working: the filter has nothing to offer and the grid has nothing to draw
// them with.
//
// The observation is the column as the product describes it afterwards, which
// is where the choices live and what every one of those things reads.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";
const BORROWED_FIELD = "Status, borrowed";

export const runLookupSelectChoicesKeptCase = async (
  bugCase: BugCaseFor<"lookup-select-choices-kept">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupSelectChoicesKeptCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.choices.length < 2) {
    throw new Error(
      "two choices at least - with one, a column that lost its choices and one that kept a single choice are hard to tell apart",
    );
  }

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: config.choices.map((choice, index) => ({
              name: choice,
              color: index === 0 ? Colors.BlueBright : Colors.OrangeBright,
            })),
          },
        },
      ],
      records: [
        {
          fields: { [NAME_FIELD]: "a-row", [STATUS_FIELD]: config.choices[0] },
        },
      ],
    });
    createdTableIds.unshift(foreign.id);
    const statusFieldId = foreign.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    )?.id;
    if (!statusFieldId) {
      throw new Error("the source table is not in place");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "the-host-row" } }],
    });
    createdTableIds.unshift(host.id);

    // Two ways to reach the same table: the link the borrowed column starts
    // on, and the one it is moved to.
    const firstLink = await createField(host.id, {
      name: "Source",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
      },
    });
    const secondLink = await createField(host.id, {
      name: "Source, the other way",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
      },
    });

    const borrowed = await createField(host.id, {
      name: BORROWED_FIELD,
      type: FieldType.SingleSelect,
      isLookup: true,
      lookupOptions: {
        foreignTableId: foreign.id,
        linkFieldId: firstLink.id,
        lookupFieldId: statusFieldId,
      },
    });

    // Fixture verification, outside the checkpoint: the borrowed column offers
    // the choices before it is repointed. Without this, a column that never
    // had them would pass the checkpoint by failing it for the wrong reason.
    const choiceNames = (field: {
      options?: { choices?: { name: string }[] };
    }) => (field.options?.choices ?? []).map((choice) => choice.name).sort();
    const before = choiceNames(borrowed);
    if (before.join(" ") !== [...config.choices].sort().join(" ")) {
      throw new Error(
        `the borrowed column starts offering [${before.join(", ")}], expected [${[...config.choices].sort().join(", ")}]`,
      );
    }

    const probe = await bugCheckpoint(
      "repointing-a-borrowed-choice-column-keeps-its-choices",
      async () => {
        // The same information, reached a different way.
        await apiConvertField(host.id, borrowed.id, {
          name: BORROWED_FIELD,
          type: FieldType.SingleSelect,
          isLookup: true,
          lookupOptions: {
            foreignTableId: foreign.id,
            linkFieldId: secondLink.id,
            lookupFieldId: statusFieldId,
          },
        });

        const after = await getField(host.id, borrowed.id);
        const offered = choiceNames(after);
        if (offered.join(" ") !== [...config.choices].sort().join(" ")) {
          throw new Error(
            `after being pointed through the other link the column offers [${offered.join(", ")}], expected ` +
              `[${[...config.choices].sort().join(", ")}] - a choice column with no choices is a filter with nothing to list and a cell nobody can fill in`,
          );
        }
        if (after.lookupOptions?.linkFieldId !== secondLink.id) {
          throw new Error(
            `the column still travels along ${JSON.stringify(after.lookupOptions?.linkFieldId)}, expected the other link - the edit did not take`,
          );
        }
        return { offered };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        borrowedFieldId: borrowed.id,
        choicesAfterRepointing: probe.offered,
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
