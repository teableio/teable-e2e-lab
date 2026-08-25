import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { createRecords as apiCreateRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ManyoneTypecastShapeCaseConfig } from "../types";

// Add a row and fill its link in by typing the other row's name -> checkpoint:
// the cell comes back holding one row, because the column holds one row.
//
// Filling a link in by name rather than by picking from a list is what every
// import does, and what a person does when they paste a column of names. The
// product looks the name up and stores the row it found.
//
// It stored the row inside a list. The column is a "one row" column - it says
// so, and every other row in the table holds a plain value - so from then on
// one row in the table is shaped unlike all the others. Nothing shows that on
// screen; it surfaces later, in whatever reads the table expecting the shape
// the column advertises.
//
// The observation is the answer to the write, because that answer is what an
// import or a script carries on with.

const NAME_FIELD = "Name";
const LINK_FIELD = "Target";

export const runManyoneTypecastShapeCase = async (
  bugCase: BugCaseFor<"manyone-typecast-shape">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ManyoneTypecastShapeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const targets = await createTable(baseId, {
      name: `${suffix}-targets`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.targetName } }],
    });
    createdTableIds.unshift(targets.id);
    const targetRowId = targets.records?.[0]?.id;
    if (!targetRowId) {
      throw new Error("the table of targets is not in place");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(host.id);
    // A "one row" link: each row here points at one row there.
    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: targets.id,
      },
    });

    // Fixture verification, outside the checkpoint: the column really is a
    // "one row" column. Against a column that holds several, a list would be
    // the right answer and there would be nothing to report.
    if (link.isMultipleCellValue === true) {
      throw new Error(
        "the link column holds several rows, so a list would be the correct shape and the case has nothing to ask",
      );
    }

    // A row filled in by picking the target directly - the shape every other
    // row in this table has, and what the checkpoint compares against.
    const picked = await apiCreateRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [host.fields[0].id]: config.pickedRowName,
            [link.id]: { id: targetRowId },
          },
        },
      ],
    });
    const pickedCell = picked.data.records[0]?.fields[link.id];
    if (Array.isArray(pickedCell) || !pickedCell) {
      throw new Error(
        `picking the row directly already answers with ${JSON.stringify(pickedCell)} - the fixture cannot tell the two ways apart`,
      );
    }

    const probe = await bugCheckpoint(
      "filling-a-one-row-link-in-by-name-holds-one-row",
      async () => {
        // The same cell, filled in by typing the name instead of picking:
        // what an import sends, and what a pasted column of names becomes.
        const typed = await apiCreateRecords(host.id, {
          fieldKeyType: FieldKeyType.Id,
          typecast: true,
          records: [
            {
              fields: {
                [host.fields[0].id]: config.typedRowName,
                [link.id]: config.targetName,
              },
            },
          ],
        });
        const cell = typed.data.records[0]?.fields[link.id] as
          | { id?: string; title?: string }
          | { id?: string; title?: string }[]
          | undefined;
        if (Array.isArray(cell)) {
          throw new Error(
            `filling the link in by name answered with a list of ${cell.length}: ${JSON.stringify(cell)} - ` +
              `the same cell filled in by picking answers ${JSON.stringify(pickedCell)}, and the column holds one row`,
          );
        }
        if (cell?.id !== targetRowId) {
          throw new Error(
            `filling the link in by name found ${JSON.stringify(cell)}, expected the row named ${JSON.stringify(config.targetName)}`,
          );
        }
        return { cell };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        targetsTableId: targets.id,
        pickedCell,
        typedCell: probe.cell,
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
