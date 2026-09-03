import { FieldType } from "@teable/core";
import {
  axios,
  createBase as apiCreateBase,
  getTableList as apiGetTableList,
  permanentDeleteBase,
  DUPLICATE_BASE,
  urlBuilder,
} from "@teable/openapi";
import { createTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SameNamedFkBaseDuplicateCaseConfig } from "../types";

// A base whose tables each carry a foreign key under the SAME name ->
// duplicate the base with its rows -> checkpoint: the copy is made, with every
// table in it.
//
// Postgres constraint names are unique per table, not per schema, so two
// tables in one base can each own a constraint called `fk___id` - and legacy
// bases do, from a self-referencing key on the row id column that no current
// code writes. Duplicating a base drops those keys, copies the rows, and puts
// the keys back.
//
// The step that listed them matched on the name and the schema and not on the
// table, so each table's list came back holding the other table's rows too.
// The drop phase then issued the same DROP twice for one table, the second one
// found nothing, and the whole duplicate died on a Postgres error naming a
// constraint that "does not exist" (42704) - reported from production as an
// unhandled rejection in the browser, with the base half-made.
//
// The keys are written with SQL because nothing a person can do produces them
// any more; they are what an old base has been carrying since before the
// naming changed. That is the same reason nobody could get out of this from
// the interface.

const NAME_FIELD = "Name";
const LEGACY_FK_NAME = "fk___id";

export const runSameNamedFkBaseDuplicateCase = async (
  bugCase: BugCaseFor<"same-named-fk-base-duplicate">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SameNamedFkBaseDuplicateCaseConfig = bugCase.config;
  const spaceId = globalThis.testConfig.spaceId;
  const suffix = `${config.baseNamePrefix}-${context.runId}`;
  let sourceBaseId = "";
  let copyId = "";

  if (config.tableNames.length < 2) {
    throw new Error(
      "two tables at least - one table cannot collide with itself, and the collision is the bug",
    );
  }

  try {
    const source = await apiCreateBase({ spaceId, name: `${suffix}-source` });
    sourceBaseId = source.data.id;

    const tables = [];
    for (const name of config.tableNames) {
      tables.push(
        await createTable(sourceBaseId, {
          name,
          fields: [
            {
              name: NAME_FIELD,
              type: FieldType.SingleLineText,
              isPrimary: true,
            },
          ],
          records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
        }),
      );
    }

    // The state an old base carries: a self-referencing key on the row id
    // column, under a name that was never made unique per schema.
    const db = fixtureDb(context.app);
    const placed: { schema: string; table: string }[] = [];
    for (const table of tables) {
      const physical = await db.physicalTable(table.id);
      await db.execute(
        `ALTER TABLE "${physical.schema}"."${physical.table}" ` +
          `ADD CONSTRAINT "${LEGACY_FK_NAME}" FOREIGN KEY ("__id") ` +
          `REFERENCES "${physical.schema}"."${physical.table}" ("__id") ON DELETE SET NULL`,
      );
      placed.push(physical);
    }

    // Fixture verification, outside the checkpoint: two tables really do hold
    // one name between them. With only one, there is nothing to collide and
    // the case would report on nothing.
    const schema = placed[0]?.schema;
    const holders = await db.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE con.contype = 'f' AND nsp.nspname = $1 AND con.conname = $2`,
      schema,
      LEGACY_FK_NAME,
    );
    const holderCount = holders[0]?.count ?? 0;
    if (holderCount !== tables.length) {
      throw new Error(
        `${holderCount} table(s) in ${schema} carry a key named ${LEGACY_FK_NAME}, expected ${tables.length} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-base-whose-tables-share-a-key-name-can-be-copied",
      async () => {
        // Raw axios with the status open. Before the fix this request is
        // refused, and the generated client throws a bare "Internal Server
        // Error" and drops the response - which is exactly the part worth
        // reading, because a 500 that turned out to be something else would
        // make this case red for the wrong reason.
        const duplicated = await axios.post(
          urlBuilder(DUPLICATE_BASE, {}),
          {
            fromBaseId: sourceBaseId,
            spaceId,
            name: `${suffix}-copy`,
            withRecords: true,
          },
          { validateStatus: () => true },
        );
        if (duplicated.status < 200 || duplicated.status >= 300) {
          throw new Error(
            `duplicating the base answered ${duplicated.status}: ` +
              (typeof duplicated.data === "string"
                ? duplicated.data
                : JSON.stringify(duplicated.data)),
          );
        }
        copyId = (duplicated.data as { id?: string })?.id ?? "";
        if (!copyId) {
          throw new Error(
            `duplicating the base produced no copy: ${JSON.stringify(duplicated.data)}`,
          );
        }
        const routing = assertServedByV2(duplicated.headers, {
          operation: "POST /base/duplicate",
          feature: "duplicateBase",
        });

        // And the copy is whole. A duplicate that answered 201 while losing a
        // table would be the same interrupted copy behind a success.
        const copied = await apiGetTableList(copyId);
        const copiedNames = copied.data.map(
          (table: { name: string }) => table.name,
        );
        for (const name of config.tableNames) {
          if (!copiedNames.includes(name)) {
            throw new Error(
              `the copy is missing the table ${JSON.stringify(name)} - it holds ${JSON.stringify(copiedNames)}`,
            );
          }
        }
        return { routing, copiedNames };
      },
    );

    return {
      details: {
        sourceBaseId,
        copyId,
        schema,
        constraintName: LEGACY_FK_NAME,
        ...probe,
      },
    };
  } finally {
    for (const id of [copyId, sourceBaseId]) {
      if (!id) {
        continue;
      }
      try {
        await permanentDeleteBase(id);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (base ${id}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
