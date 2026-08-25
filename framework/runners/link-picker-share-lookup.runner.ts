import { FieldType, Relationship } from "@teable/core";
import { axios, SHARE_VIEW_GET, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkPickerShareLookupCaseConfig } from "../types";

// A column that borrows a link from another table -> open the row picker
// behind it -> checkpoint: the picker opens, on the table the borrowed link
// actually points at.
//
// Clicking a link cell opens a list of rows to choose from. The list has to
// come from somewhere, and for a borrowed link column the table it comes from
// is written down one level deeper than for an ordinary one: the borrowed
// column keeps the name of the column it borrows, and only that column knows
// which table it reaches.
//
// The picker looked in the shallower place, found nothing, and asked the
// database for a table with no id. What the person sees is a picker that will
// not open on one particular column, with no way to tell that column apart
// from the ones that work.
//
// The stored shape is finished with SQL: a column made through the interface
// carries a copy of the settings that the same column, made months ago, does
// not. Reproducing the bug means reproducing the older shape.

const NAME_FIELD = "Name";
const BORROWED_FIELD = "Target, borrowed";

export const runLinkPickerShareLookupCase = async (
  bugCase: BugCaseFor<"link-picker-share-lookup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkPickerShareLookupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    // The table the picker has to end up listing.
    const targets = await createTable(baseId, {
      name: `${suffix}-targets`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.targetRowName } }],
    });
    createdTableIds.unshift(targets.id);

    const middle = await createTable(baseId, {
      name: `${suffix}-middle`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "the-middle-row" } }],
    });
    createdTableIds.unshift(middle.id);
    const middleLink = await createField(middle.id, {
      name: "Target",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: targets.id,
      },
    });

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "the-host-row" } }],
    });
    createdTableIds.unshift(host.id);
    const hostLink = await createField(host.id, {
      name: "Middle",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: middle.id,
      },
    });
    const borrowed = await createField(host.id, {
      name: BORROWED_FIELD,
      type: FieldType.Link,
      isLookup: true,
      lookupOptions: {
        foreignTableId: middle.id,
        linkFieldId: hostLink.id,
        lookupFieldId: middleLink.id,
      },
    });

    // Fixture verification, outside the checkpoint: the borrowed column really
    // borrows the middle table's link. If it borrowed something else, the
    // picker would be right to look elsewhere.
    if (borrowed.lookupOptions?.lookupFieldId !== middleLink.id) {
      throw new Error(
        `the borrowed column borrows ${JSON.stringify(borrowed.lookupOptions?.lookupFieldId)}, expected the middle table's link`,
      );
    }

    // Setup: the stored shape a column made before carries - the settings that
    // say where it points live only in the borrowing half.
    const db = fixtureDb(context.app);
    await db.execute(
      `UPDATE "field" SET "options" = NULL WHERE "id" = $1`,
      borrowed.id,
    );

    const probe = await bugCheckpoint(
      "the-picker-behind-a-borrowed-link-opens",
      async () => {
        // Raw axios with the status open: a picker that refuses and a picker
        // that opens on the wrong table are different reports, and the status
        // tells them apart.
        const response = await axios.get(
          urlBuilder(SHARE_VIEW_GET, { shareId: borrowed.id }),
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `opening the picker behind the borrowed column answered ${response.status}: ` +
              `${JSON.stringify(response.data)?.slice(0, 300)} - the same click works on an ordinary link column`,
          );
        }
        const body = response.data as {
          tableId?: string;
          fields?: { isPrimary?: boolean }[];
        };
        if (body.tableId !== targets.id) {
          throw new Error(
            `the picker opened on table ${JSON.stringify(body.tableId)}, expected ${targets.id} - ` +
              "the borrowed column reaches the target table through the column it borrows",
          );
        }
        if (!body.fields?.some((field) => field.isPrimary)) {
          throw new Error(
            `the picker came back with no name column to show: ${JSON.stringify(body.fields)}`,
          );
        }
        return {
          status: response.status,
          routing: pickRoutingHeaders(response.headers),
        };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        middleTableId: middle.id,
        targetsTableId: targets.id,
        borrowedFieldId: borrowed.id,
        status: probe.status,
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
