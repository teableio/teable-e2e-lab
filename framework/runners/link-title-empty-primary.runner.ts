import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
  urlBuilder,
  UPDATE_RECORD,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkTitleEmptyPrimaryCaseConfig } from "../types";

// A link pointing at a row whose name is blank -> save the same link a second
// time, the way the interface does -> checkpoint: the cell does not come back
// carrying an empty name, and writing back exactly what came back is accepted.
//
// A row is allowed to have no name yet. It is the first thing about a row a
// person fills in last: the row exists, other rows already point at it, and
// the name column is still blank.
//
// Saving a link cell that already holds that link - which the interface does
// whenever a cell is confirmed without being changed - stored "the name is
// nothing" into the cell rather than storing no name at all. From then on the
// cell holds a value the product itself refuses to accept, so the person can
// no longer edit that cell: whatever they do with it, they are sending back
// the value they were given, and it comes back rejected.
//
// The second half is the part that has to be measured rather than reasoned
// about, which is why the case writes back exactly the bytes it read.

const NAME_FIELD = "Name";
const TITLE_FIELD = "Title";
const LINK_FIELD = "Related";

type LinkCell = { id?: string; title?: string | null };

export const runLinkTitleEmptyPrimaryCase = async (
  bugCase: BugCaseFor<"link-title-empty-primary">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkTitleEmptyPrimaryCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    // Two rows on the other table: one still unnamed, one named. The named one
    // is what keeps "the name was dropped for the unnamed row" apart from "the
    // name was dropped for every row".
    const foreign = await createTable(baseId, {
      name: `${suffix}-targets`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      // The unnamed row is written as explicitly having no name rather than
      // left out, which is what clearing the name column sends.
      records: [
        { fields: { [NAME_FIELD]: null } },
        { fields: { [NAME_FIELD]: config.namedRowTitle } },
      ],
    });
    createdTableIds.unshift(foreign.id);
    const unnamedId = foreign.records?.[0]?.id;
    const namedId = foreign.records?.[1]?.id;
    if (!unnamedId || !namedId) {
      throw new Error("the table of targets is not in place");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: LINK_FIELD,
          type: FieldType.Link,
          options: {
            relationship: Relationship.ManyMany,
            foreignTableId: foreign.id,
            // Which column on the other table the cell shows. Naming it is
            // what the field dialog does; leaving it out is green on both
            // columns, run 32825087075.
            lookupFieldId: foreign.fields[0].id,
            isOneWay: true,
          },
        },
      ],
      records: [
        {
          fields: {
            [TITLE_FIELD]: config.hostRowTitle,
            [LINK_FIELD]: [{ id: unnamedId }, { id: namedId }],
          },
        },
      ],
    });
    createdTableIds.unshift(host.id);
    const hostRowId = host.records?.[0]?.id;
    const linkFieldId = host.fields.find(
      (field: { name: string }) => field.name === LINK_FIELD,
    )?.id;
    if (!hostRowId || !linkFieldId) {
      throw new Error("the host table is not in place");
    }

    // Fixture verification, outside the checkpoint: the cell points at both
    // rows before anything is written a second time, and the unnamed row is
    // really unnamed. Without the second, the case would be about a row that
    // simply has a name.
    const before = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const beforeCell = (before.data.records.find(
      (record: { id: string }) => record.id === hostRowId,
    )?.fields[linkFieldId] ?? []) as LinkCell[];
    const beforeIds = beforeCell.map((link) => link.id).sort();
    if (beforeIds.join(" ") !== [unnamedId, namedId].sort().join(" ")) {
      throw new Error(
        `the link cell starts holding [${beforeIds.join(", ")}], expected both target rows`,
      );
    }
    const namedBefore = beforeCell.find((link) => link.id === namedId);
    if (namedBefore?.title !== config.namedRowTitle) {
      throw new Error(
        `the named row reads back as ${JSON.stringify(namedBefore?.title)}, expected ${JSON.stringify(config.namedRowTitle)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "saving-a-link-to-an-unnamed-row-keeps-the-cell-writable",
      async () => {
        // The write the interface makes when a cell is confirmed without being
        // changed: the same two links, again.
        await apiUpdateRecord(host.id, hostRowId, {
          fieldKeyType: FieldKeyType.Id,
          record: {
            fields: { [linkFieldId]: beforeCell.map(({ id }) => ({ id })) },
          },
        });

        const after = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 5,
        });
        const cell = (after.data.records.find(
          (record: { id: string }) => record.id === hostRowId,
        )?.fields[linkFieldId] ?? []) as LinkCell[];
        const unnamedCell = cell.find((link) => link.id === unnamedId);
        if (!unnamedCell) {
          throw new Error(
            `the link to the unnamed row is gone after saving the cell again: ${JSON.stringify(cell)}`,
          );
        }
        if ("title" in unnamedCell && unnamedCell.title == null) {
          throw new Error(
            `the cell now carries an empty name for the unnamed row: ${JSON.stringify(unnamedCell)} - ` +
              "a row with no name yet is not a row whose name is nothing",
          );
        }
        const namedCell = cell.find((link) => link.id === namedId);
        if (namedCell?.title !== config.namedRowTitle) {
          throw new Error(
            `the named row lost its name too: ${JSON.stringify(namedCell)}`,
          );
        }

        // And the half a person actually hits: writing back exactly what was
        // read. Raw axios with the status open, because a refusal is the
        // report and the client would turn it into a thrown error carrying
        // less.
        const response = await axios.patch(
          urlBuilder(UPDATE_RECORD, {
            tableId: host.id,
            recordId: hostRowId,
          }),
          {
            fieldKeyType: FieldKeyType.Id,
            record: { fields: { [linkFieldId]: cell } },
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `writing the cell back exactly as it was read answered ${response.status}: ` +
              `${JSON.stringify(response.data)} - the person cannot edit this cell at all`,
          );
        }
        return { cell, routing: pickRoutingHeaders(response.headers) };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        hostRowId,
        cellAfterRepeatWrite: probe.cell,
        routing: probe.routing,
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
