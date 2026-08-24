import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  deleteRecords as apiDeleteRecords,
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
import type { DeleteWithBrokenLinkCaseConfig } from "../types";

// A table with a link column whose target is gone -> delete a row ->
// checkpoint: the row is deleted.
//
// Deleting a row clears that row out of every link it takes part in, and the
// clearing is addressed to the table on the other end. When that table is not
// there any more, the clearing fails and the delete fails with it.
//
// The result is a table nobody can remove anything from. Not the broken column
// - the rows. Deleting from the grid, from the API and in bulk all answer the
// same way, and the message names a table id the user has never seen because
// the table it belonged to is gone.
//
// The state is what a base is left in when a linked table is removed while
// something still points at it. It is marked in the product's own bookkeeping
// as a column with an error; the case writes that bookkeeping directly,
// because the sequence that produces it is a repair job's business rather than
// a request anyone makes.

const NAME_FIELD = "Name";
const LINK_FIELD = "Broken link";

export const runDeleteWithBrokenLinkCase = async (
  bugCase: BugCaseFor<"delete-with-broken-link">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeleteWithBrokenLinkCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.foreignRowTitle } }],
    });
    createdTableIds.unshift(foreign.id);

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.rowTitles.map((title) => ({
        fields: { [NAME_FIELD]: title },
      })),
    });
    createdTableIds.unshift(host.id);
    const doomedRecordId = host.records[0]?.id;
    if (!doomedRecordId) {
      throw new Error(`Table ${host.id} is not in place`);
    }

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });

    // Setup, outside the checkpoint: point the column at a table that is not
    // there and mark it as the product marks a column it knows is broken.
    const db = fixtureDb(context.app);
    const brokenOptions = {
      ...(linkField.options as Record<string, unknown>),
      foreignTableId: config.missingTableId,
      fkHostTableName: `${(linkField.options as { fkHostTableName?: string }).fkHostTableName}_missing`,
    };
    await db.execute(
      `UPDATE "field" SET "has_error" = true, "options" = $1 WHERE "id" = $2`,
      JSON.stringify(brokenOptions),
      linkField.id,
    );

    const probe = await bugCheckpoint(
      "a-row-can-be-deleted-when-a-link-points-at-a-table-that-is-gone",
      async () => {
        // A refused delete throws here, which is the report: the table cannot
        // be cleaned up at all.
        await apiDeleteRecords(host.id, [doomedRecordId]);

        const left = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rowTitles.length,
        });
        const names = left.data.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD] ?? ""),
        );
        if (names.includes(config.rowTitles[0] as string)) {
          throw new Error(
            `the delete was accepted but ${config.rowTitles[0]} is still in the table: ${JSON.stringify(names)}`,
          );
        }
        // The other rows are the other half: a delete that took the table
        // apart would be worse than one that refused.
        const expected = config.rowTitles.slice(1);
        if (names.sort().join(",") !== [...expected].sort().join(",")) {
          throw new Error(
            `after deleting one row the table holds ${JSON.stringify(names)}, expected ` +
              `${JSON.stringify(expected)}`,
          );
        }
        return { left: names };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        linkFieldId: linkField.id,
        deletedRecordId: doomedRecordId,
        rowsLeft: probe.left,
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
