import { FieldType } from "@teable/core";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SparseViewFieldOrderCaseConfig } from "../types";

// A view whose column metadata only mentions some of its fields -> add a field
// -> checkpoint: the columns read left to right in the order they were made,
// with the new one last.
//
// A view stores where each column sits. Tables that predate that bookkeeping,
// or that lost entries along the way, have views listing only some of their
// fields - and the ones with no entry are exactly the ones nobody has moved.
// Appending to such a view derived the new column's position from the entries
// that exist rather than from the columns that exist, so the new field was
// given a position already taken. What the user gets is a column that does not
// appear where it was added: somewhere in the middle, or not visibly at all.
//
// The sparse metadata is written with SQL. The product will not produce it -
// every view it writes today lists every field - and that is the point: this
// is the shape of a table older than the current bookkeeping.

const FIRST_FIELD = "Title";

export const runSparseViewFieldOrderCase = async (
  bugCase: BugCaseFor<"sparse-view-field-order">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SparseViewFieldOrderCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.legacyFieldNames.length < 2) {
    throw new Error(
      "at least two fields have to be missing their entry - with one, an appended column landing on top of it " +
        "cannot be told from an ordering that is merely off by one",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: FIRST_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        ...config.legacyFieldNames.map((name) => ({
          name,
          type: FieldType.SingleLineText,
        })),
      ],
      records: [],
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const firstFieldId = table.fields.find(
      (field: { name: string }) => field.name === FIRST_FIELD,
    )?.id;
    if (!viewId || !firstFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const db = fixtureDb(context.app);
    // Only the first field keeps an entry. The rest are what a table older
    // than the current bookkeeping looks like: present as columns, absent from
    // the view's own record of where columns sit.
    const trimmed = await db.execute(
      `UPDATE "view" SET "column_meta" = $1 WHERE "id" = $2`,
      JSON.stringify({ [firstFieldId]: { order: 0 } }),
      viewId,
    );
    if (trimmed !== 1) {
      throw new Error(
        `trimming the column metadata of ${viewId} touched ${trimmed} rows, expected 1`,
      );
    }

    // Fixture verification, outside the checkpoint: the view really does list
    // one field now. A metadata write that did not land would leave an
    // ordinary view, and every commit would pass.
    const stored = await db.query<{ column_meta: string }[]>(
      `SELECT "column_meta" FROM "view" WHERE "id" = $1`,
      viewId,
    );
    const storedKeys = Object.keys(JSON.parse(stored[0]?.column_meta ?? "{}"));
    if (storedKeys.length !== 1 || storedKeys[0] !== firstFieldId) {
      throw new Error(
        `the view's column metadata lists ${JSON.stringify(storedKeys)}, expected just ${firstFieldId} - ` +
          "the fixture is not in place",
      );
    }

    const expected = [
      FIRST_FIELD,
      ...config.legacyFieldNames,
      config.addedFieldName,
    ];

    const probe = await bugCheckpoint(
      "added-field-lands-after-the-ones-without-metadata",
      async () => {
        await createField(tableId, {
          name: config.addedFieldName,
          type: FieldType.SingleLineText,
          viewId,
        });

        // Read through the view: this is the order the grid draws, which is
        // the thing the user is looking at.
        const fields = await getFields(tableId, viewId);
        const names = fields.map((field: { name: string }) => field.name);
        if (names.join(" | ") !== expected.join(" | ")) {
          throw new Error(
            `the view lists ${JSON.stringify(names)}, expected ${JSON.stringify(expected)} - ` +
              "the added column did not land after the ones the view had no entry for",
          );
        }
        return { names };
      },
    );

    // Recorded after the checkpoint: the positions the view ended up storing.
    // Diagnostic, so a read that throws is never mistaken for the bug.
    const after = await db.query<{ column_meta: string }[]>(
      `SELECT "column_meta" FROM "view" WHERE "id" = $1`,
      viewId,
    );

    return {
      details: {
        tableId,
        viewId,
        expectedOrder: expected,
        observedOrder: probe.names,
        columnMetaAfter: JSON.parse(after[0]?.column_meta ?? "{}"),
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
