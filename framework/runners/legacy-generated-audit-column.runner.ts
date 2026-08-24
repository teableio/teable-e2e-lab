import { FieldKeyType, FieldType } from "@teable/core";
import { createRecords as apiCreateRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LegacyGeneratedAuditColumnCaseConfig } from "../types";

// A table carried over from an older version, where "created by" is a column
// the database fills in itself -> add a row -> checkpoint: the row is added.
//
// The product writes the author into that column on every insert. On a table
// whose storage says the database owns the column, Postgres refuses the write
// outright - and refuses the whole insert with it.
//
// What the user sees is a table they cannot add anything to. Not a slow table,
// not a table with a broken column: every attempt to create a row fails, in
// the grid, through the API and through an import alike. Nothing in the
// message is about who created the row.
//
// The storage is made with SQL because the product does not produce it any
// more; it is what tables migrated from the previous version carry, and it is
// invisible from the product - the column reads the same either way.

const NAME_FIELD = "Name";
const AUTHOR_FIELD = "Created by";

export const runLegacyGeneratedAuditColumnCase = async (
  bugCase: BugCaseFor<"legacy-generated-audit-column">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LegacyGeneratedAuditColumnCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AUTHOR_FIELD, type: FieldType.CreatedBy },
      ],
      records: [],
    });
    tableId = table.id;
    const authorField = table.fields.find(
      (field: { name: string }) => field.name === AUTHOR_FIELD,
    );
    if (!authorField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Setup, outside the checkpoint: give the author column the storage a
    // table migrated from the previous version has - one the database fills in
    // itself and refuses to be written to. Generated from the row id, because
    // what the value is does not matter; that the database owns it does.
    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(tableId);
    const column = await db.physicalColumn(authorField.id);
    await db.execute(
      `ALTER TABLE "${physical.schema}"."${physical.table}" DROP COLUMN "${column}"`,
    );
    await db.execute(
      `ALTER TABLE "${physical.schema}"."${physical.table}" ` +
        `ADD COLUMN "${column}" text GENERATED ALWAYS AS ("__id") STORED`,
    );

    const probe = await bugCheckpoint(
      "a-row-can-be-added-to-a-table-carried-over-from-the-old-version",
      async () => {
        // A refused insert throws here, which is the report: the table cannot
        // be added to at all.
        const created = await apiCreateRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
        });
        const record = created.data.records[0];
        if (!record) {
          throw new Error("creating a row returned no row");
        }
        // The row is not enough: the cell the caller sent has to be in it.
        if (record.fields[NAME_FIELD] !== config.rowTitle) {
          throw new Error(
            `the row was created but holds ${JSON.stringify(record.fields[NAME_FIELD])} where ` +
              `${JSON.stringify(config.rowTitle)} was sent`,
          );
        }
        return { recordId: record.id };
      },
    );

    return {
      details: {
        tableId,
        authorFieldId: authorField.id,
        recordId: probe.recordId,
      },
    };
  } finally {
    if (tableId) {
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
