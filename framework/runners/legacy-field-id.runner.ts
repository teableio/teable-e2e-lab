import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecords as apiUpdateRecords,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LegacyFieldIdCaseConfig } from "../types";

// A table holding a field whose id is shorter than the ids this version
// generates -> read the table and write to it -> checkpoint: both work.
//
// Field ids, like record ids, only had their prefix enforced in v1, so bases
// that were imported or migrated carry ids whose body is not the length v2
// generates. v2 parsed them strictly.
//
// The blast radius is a table rather than a row: a field id is part of every
// query built against the table it belongs to, so one unparseable field is a
// table nobody can read.
//
// The legacy id is written with SQL because the product cannot mint one - id
// generation moved to the strict format long ago. Renaming it means moving the
// view's own record of that column too, which is what the fixture does; a
// half-renamed field would be a broken table for a reason that has nothing to
// do with parsing.

const NAME_FIELD = "Name";
const NOTE_FIELD = "Note";
const ROW_TITLE = "the-row";

export const runLegacyFieldIdCase = async (
  bugCase: BugCaseFor<"legacy-field-id">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LegacyFieldIdCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (!/^fld[0-9a-zA-Z]+$/.test(config.legacyFieldId)) {
    throw new Error(
      `"${config.legacyFieldId}" is not a field id - it has to keep the fld prefix, which v1 did enforce`,
    );
  }
  if (config.legacyFieldId.length - 3 === 16) {
    throw new Error(
      `"${config.legacyFieldId}" has the canonical 16-character body - it is what this version generates, ` +
        "so nothing about it is legacy",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        { fields: { [NAME_FIELD]: ROW_TITLE, [NOTE_FIELD]: config.seedValue } },
      ],
    });
    tableId = table.id;
    const noteFieldId = table.fields.find(
      (field: { name: string }) => field.name === NOTE_FIELD,
    )?.id;
    const viewId = table.views?.[0]?.id;
    const recordId = table.records[0]?.id;
    if (!noteFieldId || !viewId || !recordId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const db = fixtureDb(context.app);
    // The field row, and the view's record of where that column sits. Both
    // name the id, and leaving either behind would break the table for a
    // reason that is not about parsing.
    const renamed = await db.execute(
      `UPDATE "field" SET "id" = $1 WHERE "id" = $2`,
      config.legacyFieldId,
      noteFieldId,
    );
    if (renamed !== 1) {
      throw new Error(
        `giving "${NOTE_FIELD}" a legacy id touched ${renamed} rows, expected 1`,
      );
    }
    const meta = await db.query<{ column_meta: string }[]>(
      `SELECT "column_meta" FROM "view" WHERE "id" = $1`,
      viewId,
    );
    const columnMeta = JSON.parse(meta[0]?.column_meta ?? "{}") as Record<
      string,
      unknown
    >;
    if (columnMeta[noteFieldId] !== undefined) {
      columnMeta[config.legacyFieldId] = columnMeta[noteFieldId];
      delete columnMeta[noteFieldId];
      await db.execute(
        `UPDATE "view" SET "column_meta" = $1 WHERE "id" = $2`,
        JSON.stringify(columnMeta),
        viewId,
      );
    }

    // Fixture verification, outside the checkpoint: the id really moved.
    const check = await db.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM "field" WHERE "id" = $1`,
      config.legacyFieldId,
    );
    if ((check[0]?.count ?? 0) !== 1) {
      throw new Error(
        `no field carries the id ${config.legacyFieldId} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "table-with-a-legacy-field-id-reads-and-writes",
      async () => {
        // Reading the table at all. Every query built against it names its
        // fields, so this is the first thing a person would find broken.
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 1,
        });
        const before = String(read.data.records[0]?.fields[NOTE_FIELD] ?? "");
        if (before !== config.seedValue) {
          throw new Error(
            `reading the table returned ${JSON.stringify(before)} for "${NOTE_FIELD}", expected ` +
              `${JSON.stringify(config.seedValue)}`,
          );
        }

        // And writing to it, addressing the field by the legacy id itself -
        // which is what every client that read the table would then send back.
        await apiUpdateRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          typecast: false,
          records: [
            {
              id: recordId,
              fields: { [config.legacyFieldId]: config.updatedValue },
            },
          ],
        });
        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 1,
        });
        const stored = String(after.data.records[0]?.fields[NOTE_FIELD] ?? "");
        if (stored !== config.updatedValue) {
          throw new Error(
            `the write answered but the cell reads ${JSON.stringify(stored)}, expected ` +
              `${JSON.stringify(config.updatedValue)}`,
          );
        }
        return { stored };
      },
    );

    return {
      details: {
        tableId,
        legacyFieldId: config.legacyFieldId,
        legacyBodyLength: config.legacyFieldId.length - 3,
        storedAfterWrite: probe.stored,
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
