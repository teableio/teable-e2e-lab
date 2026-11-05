import { FieldKeyType, FieldType } from "@teable/core";
import { axios } from "@teable/openapi";
import { Client } from "pg";
import {
  createBase,
  createTable,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ByodbMigrationRetryCaseConfig,
} from "../types";
import { describeResponse, isSuccess } from "./raw-api";

// A space whose data lives in its own database, with one table and two rows
// -> the data database is put in the state an older deployment left behind
// -> checkpoint: retrying the space's data-database migration succeeds and the
// table's records read back.
//
// Data-database migrations are plain PostgreSQL. They were sent through a
// query builder that treats "?" as a bind placeholder and rewrites it, so a
// migration whose SQL contains "?" ran as different SQL than was written. The
// one that inspects the shared undo capture function before touching it uses
// "?" in a pattern; rewritten, the pattern never matched, the migration
// refused to continue as it is designed to, and the connection went to error -
// every table in the space answered 500.
//
// That migration only inspects anything when the shared function in the
// public schema exists and the undo capture trigger is bound to it, which is
// how tables restored by older deployments look. The fixture builds exactly
// that: the shared function is a copy of the space's own current function, so
// the inspection has nothing to rewrite once it reads the pattern correctly.
// The migration is then marked as not yet applied, and the main database's
// record of the connection's schema version is cleared.

const NAME = "Name";
const ROWS = ["alpha", "beta"];
const CAPTURE_FUNCTION = "__teable_capture_undo_row";
const CAPTURE_TRIGGER = "__teable_undo_capture";
const MIGRATION_LEDGER = "__teable_data_schema_migrations";

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

export const runByodbMigrationRetryCase = async (
  bugCase: BugCaseFor<"byodb-migration-retry">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ByodbMigrationRetryCaseConfig = bugCase.config;
  const db = fixtureDb(context.app);
  const mainUrl = process.env.PRISMA_DATABASE_URL;
  if (!mainUrl) {
    throw new Error(
      "PRISMA_DATABASE_URL is not set, so there is no server to create the data database on",
    );
  }
  const dataDbName = `e2e_lab_byodb_${context.runId}`
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 60);
  const parsed = new URL(mainUrl);
  const dataUrl = `postgresql://${parsed.username}:${parsed.password}@${parsed.host}/${dataDbName}`;
  let created = false;
  let spaceId = "";

  try {
    await db.execute(`CREATE DATABASE ${quote(dataDbName)}`);
    created = true;

    const space = await axios.post<{ id: string }>(
      "/space",
      {
        name: `${config.namePrefix}-${context.runId}`,
        dataDb: { mode: "byodb", url: dataUrl, targetMode: "initialize-empty" },
      },
      { validateStatus: () => true },
    );
    if (!isSuccess(space) || !space.data?.id) {
      throw new Error(
        `creating a space on its own data database answered ${describeResponse(space)}`,
      );
    }
    spaceId = space.data.id;
    const baseId = (await createBase({ spaceId, name: config.namePrefix })).id;
    const table = await createTable(baseId, {
      name: "Legacy",
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: ROWS.map((row) => ({ fields: { [NAME]: row } })),
    });
    const physical = await db.physicalTable(table.id);
    const [connection] = await db.query<
      { id: string; internalSchema: string }[]
    >(
      `SELECT c."id", c."internal_schema" AS "internalSchema"
         FROM "space_data_db_binding" b
         JOIN "data_db_connection" c ON c."id" = b."data_db_connection_id"
        WHERE b."space_id" = $1`,
      spaceId,
    );
    if (!connection) {
      throw new Error("the space is not bound to its own data database");
    }

    // The legacy state, in the data database.
    const data = new Client({ connectionString: dataUrl });
    await data.connect();
    try {
      const own = `${quote(connection.internalSchema)}.${quote(CAPTURE_FUNCTION)}`;
      const [{ definition }] = (
        await data.query<{ definition: string }>(
          `SELECT pg_get_functiondef('${own}()'::regprocedure) AS definition`,
        )
      ).rows;
      const header =
        /CREATE OR REPLACE FUNCTION\s+\S+?\.("?)__teable_capture_undo_row\1\(\)/;
      if (!header.test(definition)) {
        throw new Error(
          "the space's own undo capture function does not have the expected header, so it cannot be copied",
        );
      }
      await data.query(
        definition.replace(
          header,
          `CREATE OR REPLACE FUNCTION public.${quote(CAPTURE_FUNCTION)}()`,
        ),
      );
      const target = `${quote(physical.schema)}.${quote(physical.table)}`;
      await data.query(
        `DROP TRIGGER IF EXISTS ${quote(CAPTURE_TRIGGER)} ON ${target}`,
      );
      await data.query(
        `CREATE TRIGGER ${quote(CAPTURE_TRIGGER)} AFTER INSERT OR UPDATE OR DELETE ON ${target}
           FOR EACH ROW EXECUTE FUNCTION public.${quote(CAPTURE_FUNCTION)}()`,
      );
      const removed = await data.query(
        `DELETE FROM ${quote(connection.internalSchema)}.${quote(MIGRATION_LEDGER)} WHERE "id" = $1`,
        [config.pendingMigrationId],
      );
      if (removed.rowCount !== 1) {
        throw new Error(
          `the migration ${config.pendingMigrationId} was not recorded as applied, so it cannot be made pending again`,
        );
      }
    } finally {
      await data.end();
    }
    await db.execute(
      `UPDATE "data_db_connection" SET "schema_version" = NULL WHERE "id" = $1`,
      connection.id,
    );

    const probe = await bugCheckpoint(
      "a-legacy-data-database-migrates-and-its-tables-open",
      async () => {
        const retried = await axios.post(
          `/space/${spaceId}/data-db/retry`,
          {},
          { validateStatus: () => true },
        );
        if (!isSuccess(retried)) {
          throw new Error(
            `retrying the data-database migration answered ${describeResponse(retried)}`,
          );
        }
        const read = await axios.get<{
          records?: { fields: Record<string, unknown> }[];
        }>(`/table/${table.id}/record`, {
          params: { fieldKeyType: FieldKeyType.Name },
          validateStatus: () => true,
        });
        if (!isSuccess(read)) {
          throw new Error(
            `after the retry the table's records answered ${describeResponse(read)}`,
          );
        }
        const names = (read.data.records ?? [])
          .map((record) => String(record.fields[NAME]))
          .sort();
        if (JSON.stringify(names) !== JSON.stringify([...ROWS].sort())) {
          throw new Error(
            `after the retry the table reads ${JSON.stringify(names)}, expected ${JSON.stringify(ROWS)}`,
          );
        }
        return { retryStatus: retried.status, rows: names.length };
      },
    );

    return { details: { spaceId, tableId: table.id, ...probe } };
  } finally {
    if (spaceId) {
      try {
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (created) {
      await db
        .execute(`DROP DATABASE IF EXISTS ${quote(dataDbName)} WITH (FORCE)`)
        .catch((error: unknown) =>
          console.warn(
            `[e2e-lab] could not drop ${dataDbName}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
  }
};
