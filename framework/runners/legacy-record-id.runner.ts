import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecords as apiUpdateRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LegacyRecordIdCaseConfig } from "../types";

// A row whose id is shorter than the ids this version generates, in a table
// with a formula -> change every row's source value -> checkpoint: every row's
// formula result follows.
//
// v1 only enforced the `rec` prefix on record ids, so a base that was imported
// or migrated can hold rows whose id body is not the 16 characters v2
// generates. v2 parsed ids strictly, and a row it could not parse failed its
// computed update deterministically - not a flake, the same failure every
// time, classified as a code bug and sent straight to the dead letter table.
//
// From inside the product it looks like a table where some rows compute and
// others never do, with no visible difference between them. Nothing about a
// record id is on screen.
//
// The legacy id is written with SQL because the product cannot mint one: id
// generation moved to the strict format, and every id it makes today is
// canonical. This is what an old row looks like, not what a new one can be
// made to look like. See framework/fixture-db.ts.

const NAME_FIELD = "Name";
const SOURCE_FIELD = "Source";
const COMPUTED_FIELD = "Doubled";
const LEGACY_ROW = "migrated-row";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runLegacyRecordIdCase = async (
  bugCase: BugCaseFor<"legacy-record-id">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LegacyRecordIdCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  // The shape is the fixture, so it is checked before anything is built: the
  // id has to carry the prefix every version enforces, and a body length this
  // version would never generate.
  if (!/^rec[0-9a-zA-Z]+$/.test(config.legacyRecordId)) {
    throw new Error(
      `"${config.legacyRecordId}" is not a record id at all - it has to keep the rec prefix, which v1 did enforce`,
    );
  }
  if (config.legacyRecordId.length - 3 === 16) {
    throw new Error(
      `"${config.legacyRecordId}" has the canonical 16-character body - it is exactly what this version generates, ` +
        "so nothing about it is legacy",
    );
  }
  if (config.seedValue === config.updatedValue) {
    throw new Error(
      "the seed and updated values are the same - the write would queue no recompute and the cells would " +
        "still read the seed's result",
    );
  }

  const ordinaryNames = Array.from(
    { length: config.ordinaryRowCount },
    (_, index) => `ordinary-${index}`,
  );
  const allNames = [LEGACY_ROW, ...ordinaryNames];

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SOURCE_FIELD, type: FieldType.SingleLineText },
      ],
      records: allNames.map((name) => ({
        fields: { [NAME_FIELD]: name, [SOURCE_FIELD]: config.seedValue },
      })),
    });
    tableId = table.id;
    const sourceFieldId = table.fields.find(
      (field: { name: string }) => field.name === SOURCE_FIELD,
    )?.id;
    if (!sourceFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    await createField(tableId, {
      name: COMPUTED_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `CONCATENATE({${sourceFieldId}}, {${sourceFieldId}})`,
      },
    });

    const db = fixtureDb(context.app);
    const { schema, table: physicalTable } = await db.physicalTable(tableId);
    const nameColumn = await db.physicalColumn(
      table.fields.find((field: { name: string }) => field.name === NAME_FIELD)
        .id,
    );
    // The migrated row: same row, an id from before ids were fixed-length.
    const renamed = await db.execute(
      `UPDATE "${schema}"."${physicalTable}" SET "__id" = $1 WHERE "${nameColumn}" = $2`,
      config.legacyRecordId,
      LEGACY_ROW,
    );
    if (renamed !== 1) {
      throw new Error(
        `giving "${LEGACY_ROW}" a legacy id touched ${renamed} rows, expected 1`,
      );
    }

    const readRows = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: allNames.length,
      });
      return {
        headers: response.headers,
        rows: response.data.records.map(
          (record: { id: string; fields: Record<string, unknown> }) => ({
            id: record.id,
            name: String(record.fields[NAME_FIELD] ?? ""),
            computed: String(record.fields[COMPUTED_FIELD] ?? ""),
          }),
        ),
      };
    };

    // Fixture verification, outside the checkpoint: the legacy row is readable
    // and carries the id the fixture gave it, and every row already computes
    // the seed. Without the second half, "the rows stopped computing" would be
    // describing a formula that never worked.
    const seededExpected = `${config.seedValue}${config.seedValue}`;
    const settleSeed = async () => {
      const deadline = Date.now() + config.settleTimeoutMs;
      for (;;) {
        const current = await readRows();
        const unset = current.rows.filter(
          (row) => row.computed !== seededExpected,
        );
        if (unset.length === 0 && current.rows.length === allNames.length) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `${unset.length} of ${current.rows.length} rows never computed the seed value after ` +
              `${config.settleTimeoutMs}ms - the fixture is not in place`,
          );
        }
        await sleep(config.settlePollIntervalMs);
      }
    };
    const seeded = await settleSeed();
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const legacyRow = seeded.rows.find((row) => row.name === LEGACY_ROW);
    if (legacyRow?.id !== config.legacyRecordId) {
      throw new Error(
        `the migrated row reads id ${JSON.stringify(legacyRow?.id)}, expected ${config.legacyRecordId} - ` +
          "the fixture is not in place",
      );
    }

    const expected = `${config.updatedValue}${config.updatedValue}`;
    const probe = await bugCheckpoint(
      "legacy-id-rows-still-compute",
      async () => {
        // One write covering every row, the migrated one included: they
        // recompute together, which is how a row the parser refuses takes the
        // others with it if it does.
        await apiUpdateRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: seeded.rows.map((row) => ({
            id: row.id,
            fields: { [SOURCE_FIELD]: config.updatedValue },
          })),
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let stale: string[] = [];
        for (;;) {
          const current = await readRows();
          stale = current.rows
            .filter((row) => row.computed !== expected)
            .map((row) => row.name);
          if (stale.length === 0) {
            return { rows: current.rows.map((row) => row.computed) };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.settlePollIntervalMs);
        }

        throw new Error(
          `${stale.length} of ${allNames.length} rows never got their new computed value after ` +
            `${config.settleTimeoutMs}ms (${stale.slice(0, 3).join(", ")}) - ` +
            `the table holds a row whose id is ${config.legacyRecordId.length - 3} characters long ` +
            "instead of the 16 this version generates",
        );
      },
    );

    return {
      details: {
        tableId,
        routing,
        legacyRecordId: config.legacyRecordId,
        legacyBodyLength: config.legacyRecordId.length - 3,
        ordinaryRowCount: config.ordinaryRowCount,
        computedAfterUpdate: probe.rows,
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
