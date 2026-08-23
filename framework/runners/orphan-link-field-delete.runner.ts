import { FieldType, Relationship } from "@teable/core";
import { axios, DELETE_TABLE, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  deleteField,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { OrphanLinkFieldDeleteCaseConfig } from "../types";

// A link to a table that is no longer physically there -> delete the link
// column -> checkpoint: it goes.
//
// Deleting a column removes the physical column behind it. When that column
// belongs to a link, the removal also reaches across to the table on the other
// end - and if that table's storage is gone, the statement is addressed to
// something that does not exist and the whole delete fails.
//
// The user is then stuck in a specific way: a column pointing at a table that
// is not there any more, which cannot be deleted, cannot be converted, and
// stays on the table. The error says nothing about the other table.
//
// The state is real - metadata soft-deleted while the physical table is gone -
// but the product has no request that produces it, so the storage is dropped
// with SQL after the table is trashed the ordinary way.

const NAME_FIELD = "Name";
const LINK_FIELD = "Linked";

export const runOrphanLinkFieldDeleteCase = async (
  bugCase: BugCaseFor<"orphan-link-field-delete">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: OrphanLinkFieldDeleteCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let hostTableId = "";
  let foreignTableId = "";
  let foreignDropped = false;

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.foreignRowTitle } }],
    });
    foreignTableId = foreign.id;
    const foreignPrimaryId = foreign.fields.find(
      (field: { isPrimary?: boolean }) => field.isPrimary,
    )?.id;

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        // A neighbour column, so the report is about the link and not about
        // the table having nothing left in it.
        { name: config.neighbourFieldName, type: FieldType.SingleLineText },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowTitle } }],
    });
    hostTableId = host.id;
    if (!foreignPrimaryId) {
      throw new Error(`Table ${foreignTableId} has no primary field`);
    }

    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId,
        lookupFieldId: foreignPrimaryId,
        isOneWay: false,
      },
    });

    // Trash the foreign table the ordinary way, then take its storage out from
    // under it. That second half is what no request produces, and what makes
    // the delete statement address something that is not there.
    const trashed = await axios.delete(
      urlBuilder(DELETE_TABLE, { baseId, tableId: foreignTableId }),
      { validateStatus: () => true },
    );
    if (trashed.status < 200 || trashed.status >= 300) {
      throw new Error(
        `trashing ${foreignTableId} answered ${trashed.status}: ${JSON.stringify(trashed.data)}`,
      );
    }
    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(foreignTableId);
    await db.execute(
      `DROP TABLE IF EXISTS "${physical.schema}"."${physical.table}" CASCADE`,
    );
    foreignDropped = true;

    // Fixture verification, outside the checkpoint: the link column is still
    // on the host. Deleting a column that is already gone would pass anywhere.
    const before = await getFields(hostTableId);
    if (!before.some((field: { id: string }) => field.id === linkField.id)) {
      throw new Error(
        `${LINK_FIELD} is already off ${hostTableId} before the delete - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-link-to-a-table-that-is-gone-can-still-be-deleted",
      async () => {
        // Refusals throw here, which is the report: the column cannot be
        // removed.
        await deleteField(hostTableId, linkField.id);

        const after = await getFields(hostTableId);
        if (after.some((field: { id: string }) => field.id === linkField.id)) {
          throw new Error(
            `deleting ${LINK_FIELD} was accepted but the column is still on ${hostTableId}`,
          );
        }
        // The neighbour is the other half: a delete that took the whole table
        // with it would be worse than one that failed.
        if (
          !after.some(
            (field: { name: string }) =>
              field.name === config.neighbourFieldName,
          )
        ) {
          throw new Error(
            `deleting ${LINK_FIELD} also took ${config.neighbourFieldName} off ${hostTableId}`,
          );
        }
        return { remaining: after.length };
      },
    );

    return {
      details: {
        hostTableId,
        foreignTableId,
        linkFieldId: linkField.id,
        remainingFields: probe.remaining,
      },
    };
  } finally {
    for (const tableId of [hostTableId, foreignDropped ? "" : foreignTableId]) {
      if (!tableId) continue;
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
