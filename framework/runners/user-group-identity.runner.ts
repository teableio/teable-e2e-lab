import { FieldKeyType, FieldType, SortFunc } from "@teable/core";
import { GroupPointType, getRecords as apiGetRecords } from "@teable/openapi";
import {
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserGroupIdentityCaseConfig } from "../types";

// A table with a user field, rows whose cells hold the shapes a real base
// accumulates -> group by that field -> checkpoint: every row lands in the
// bucket the fixture declares for it.
//
// Grouping a user field cannot group by the stored cell, because the stored
// cell is a write-time snapshot of the collaborator: the same person appears
// as several different values once their email or avatar changes, and as a
// bare user id on rows written before the object shape existed. The grouping
// has to fold on identity - the id and the title - and every shape that
// identity cannot be read out of is a person quietly filed under "empty".
//
// The observation is one grouped record read, the same one the grid makes.
// `groupPoints` alternates a header and a row count, so slicing the returned
// records by those counts reproduces exactly what the grid draws - which also
// means a fix that gets the buckets right while the record page keeps its own
// order is caught here rather than looking correct.
//
// The odd cell shapes are written with SQL because the product has no way to
// produce them on request: they are what earlier versions of it wrote, and a
// base collects them over months. See framework/fixture-db.ts.

const NAME_FIELD = "Name";
const USER_FIELD = "Assignee";

const partitionKey = (buckets: readonly (readonly string[])[]) =>
  buckets
    .map((bucket) => [...bucket].sort().join("|"))
    .sort()
    .join(" / ");

export const runUserGroupIdentityCase = async (
  bugCase: BugCaseFor<"user-group-identity">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserGroupIdentityCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const collaborator = {
    id: globalThis.testConfig.userId,
    title: globalThis.testConfig.userName,
    email: globalThis.testConfig.email,
  };
  let tableId = "";

  // The partition the fixture claims, and the one the broken behavior
  // produces. Declared rather than derived: what the pre-fix grouping does
  // with each shape is the thing under test, and modelling it here would make
  // the case agree with itself instead of with the product.
  const expectedBuckets = [
    ...new Set(config.rows.map((row) => row.bucket)),
  ].map((bucket) =>
    config.rows.filter((row) => row.bucket === bucket).map((row) => row.name),
  );
  if (partitionKey(expectedBuckets) === partitionKey(config.brokenBuckets)) {
    throw new Error(
      "the fixture's expected buckets and its declared broken buckets are the same partition - " +
        "this case cannot tell the fix from the bug",
    );
  }
  const declaredNames = config.rows.map((row) => row.name);
  if (new Set(declaredNames).size !== declaredNames.length) {
    throw new Error(
      "row names have to be unique - they are how rows are matched to buckets",
    );
  }
  const brokenNames = config.brokenBuckets.flat();
  if (partitionKey([brokenNames]) !== partitionKey([declaredNames])) {
    throw new Error(
      `brokenBuckets names ${JSON.stringify(brokenNames.sort())} do not cover exactly the fixture rows ` +
        `${JSON.stringify([...declaredNames].sort())}`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText },
        {
          name: USER_FIELD,
          type: FieldType.User,
          options: { isMultiple: config.multiple },
        },
      ],
      records: [],
    });
    tableId = table.id;
    const userField = table.fields.find(
      (field: { name: string }) => field.name === USER_FIELD,
    );
    const nameField = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    );
    if (!userField || !nameField) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Everything the product can write, it writes: rows carrying the
    // collaborator go in through the API so the ordinary shape in this fixture
    // is genuinely the one the product produces.
    const apiValue = config.multiple ? [collaborator] : collaborator;
    await createRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          ...(row.stored === "assigned" || row.stored === "drifted"
            ? { [USER_FIELD]: apiValue }
            : {}),
        },
      })),
    });

    const db = fixtureDb(context.app);
    const { schema, table: physicalTable } = await db.physicalTable(tableId);
    const userColumn = await db.physicalColumn(userField.id);
    const nameColumn = await db.physicalColumn(nameField.id);

    const rawFor = (row: UserGroupIdentityCaseConfig["rows"][number]) => {
      switch (row.stored) {
        case "drifted":
          // Same person, a later generation of their snapshot. `id` and
          // `title` never move - they are the identity the bucket folds on.
          return JSON.stringify(
            config.multiple
              ? [{ ...collaborator, ...row.snapshotExtras }]
              : { ...collaborator, ...row.snapshotExtras },
          );
        case "scalarId":
          // The whole cell is the bare user id, the shape written before user
          // cells carried a snapshot at all.
          return JSON.stringify(collaborator.id);
        case "bareObject":
          // A multi-value column holding a single object rather than a
          // one-element array: what a single -> multiple conversion leaves.
          return JSON.stringify(collaborator);
        default:
          return undefined;
      }
    };

    for (const row of config.rows) {
      const raw = rawFor(row);
      if (raw === undefined) {
        continue;
      }
      const changed = await db.execute(
        `UPDATE "${schema}"."${physicalTable}" SET "${userColumn}" = $1::jsonb WHERE "${nameColumn}" = $2`,
        raw,
        row.name,
      );
      if (changed !== 1) {
        throw new Error(
          `writing the ${row.stored} cell for "${row.name}" touched ${changed} rows, expected 1`,
        );
      }
    }

    // Fixture verification, outside the checkpoint: every cell holds the shape
    // the case says it holds. A shape that silently did not land would make
    // the whole partition a statement about something else.
    const storedCells = await db.query<{ name: string; value: unknown }[]>(
      `SELECT "${nameColumn}" AS name, "${userColumn}" AS value FROM "${schema}"."${physicalTable}"`,
    );
    const storedByName = new Map(
      storedCells.map((cell) => [String(cell.name), cell.value]),
    );
    for (const row of config.rows) {
      const actual = storedByName.get(row.name);
      const shapeOf = (value: unknown) => {
        if (value === null || value === undefined) return "empty";
        if (Array.isArray(value)) return "array";
        if (typeof value === "string") return "scalar";
        return "object";
      };
      const wanted = {
        empty: "empty",
        assigned: config.multiple ? "array" : "object",
        drifted: config.multiple ? "array" : "object",
        scalarId: "scalar",
        bareObject: "object",
      }[row.stored];
      if (shapeOf(actual) !== wanted) {
        throw new Error(
          `row "${row.name}" was meant to store a ${row.stored} cell (${wanted}) but holds ` +
            `${JSON.stringify(actual)} - the fixture is not in place`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "every-row-lands-in-its-own-bucket",
      async () => {
        const response = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          groupBy: [{ fieldId: userField.id, order: SortFunc.Asc }],
          take: config.rows.length,
        });
        const routing = assertServedByV2(response.headers, {
          operation: "GET /table/{tableId}/record (grouped)",
          feature: "getRecords",
        });
        const records = response.data.records;
        if (records.length !== config.rows.length) {
          throw new Error(
            `the grouped read returned ${records.length} rows, expected ${config.rows.length}`,
          );
        }
        const names = records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
        );

        // groupPoints alternates header, row count, header, row count. Slicing
        // the record page by those counts is what the grid draws, so the
        // partition below is the one a person actually sees.
        const points = response.data.extra?.groupPoints ?? [];
        const counts: number[] = [];
        let sawHeader = false;
        for (const point of points as { type: number; count?: number }[]) {
          if (point.type === GroupPointType.Header) {
            sawHeader = true;
            continue;
          }
          if (point.type === GroupPointType.Row && sawHeader) {
            counts.push(point.count ?? 0);
            sawHeader = false;
          }
        }
        const total = counts.reduce((sum, count) => sum + count, 0);
        if (total !== names.length) {
          throw new Error(
            `the group headers account for ${total} rows but the page returned ${names.length} - ` +
              `group points were ${JSON.stringify(points)}`,
          );
        }
        let offset = 0;
        const observedBuckets = counts.map((count) => {
          const bucket = names.slice(offset, offset + count);
          offset += count;
          return bucket;
        });

        if (partitionKey(observedBuckets) !== partitionKey(expectedBuckets)) {
          const asBroken =
            partitionKey(observedBuckets) ===
            partitionKey(config.brokenBuckets);
          throw new Error(
            `grouping put the rows in ${JSON.stringify(observedBuckets)}, expected ` +
              `${JSON.stringify(expectedBuckets)}` +
              (asBroken
                ? " - exactly the partition this case declares as the pre-fix behavior"
                : ""),
          );
        }
        return { routing, observedBuckets, names };
      },
    );

    return {
      details: {
        tableId,
        multiple: config.multiple,
        routing: probe.routing,
        expectedBuckets,
        observedBuckets: probe.observedBuckets,
        pageOrder: probe.names,
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
