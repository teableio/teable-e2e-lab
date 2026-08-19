import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  deleteField,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RequiredLinkRefreshCaseConfig } from "../types";

// Host row carrying a REQUIRED manyOne link and a manyMany link to the same
// table -> clear the required link's foreign key in the database, leaving its
// display column populated -> rename a row the manyMany link points at ->
// checkpoint: the renamed title reaches the manyMany cell.
//
// The two link fields are refreshed by one statement, and that is the whole
// bug. With the foreign key gone, the generated SQL took its ELSE branch and
// wrote NULL into the required link's display column, which is NOT NULL.
// Postgres answered 23502, the statement failed as a unit, and the manyMany
// field that had nothing wrong with it never updated either. The task went to
// the dead-letter table classified as a data constraint violation, which the
// admin console refuses to replay - so it needed a human, per occurrence.
//
// The cleared foreign key is written with SQL because it is wreckage, not a
// state the product will produce on request: it is what an earlier write path
// left behind. Everything observed is public API - the user's row, read the
// way the grid reads it.

const FOREIGN_NAME_FIELD = "Name";
const HOST_NAME_FIELD = "Name";
const REQUIRED_LINK_FIELD = "Required Link";
const MANY_LINK_FIELD = "Many Links";
const HOST_ROW = "host-row";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

type LinkCell = { id?: string; title?: string };

export const runRequiredLinkRefreshCase = async (
  bugCase: BugCaseFor<"required-link-refresh">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RequiredLinkRefreshCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let foreignTableId = "";
  let hostTableId = "";
  const hostLinkFieldIds: string[] = [];

  if (config.otherTitle === config.otherTitleAfter) {
    throw new Error(
      "otherTitle and otherTitleAfter are identical - the refresh would be invisible",
    );
  }

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [{ name: FOREIGN_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [
        { fields: { [FOREIGN_NAME_FIELD]: config.linkedTitle } },
        { fields: { [FOREIGN_NAME_FIELD]: config.otherTitle } },
      ],
    });
    foreignTableId = foreignTable.id;
    const foreignNameField = foreignTable.fields.find(
      (field: { name: string }) => field.name === FOREIGN_NAME_FIELD,
    );
    const linkedRecordId = foreignTable.records[0]?.id;
    const otherRecordId = foreignTable.records[1]?.id;
    if (!foreignNameField || !linkedRecordId || !otherRecordId) {
      throw new Error(`Foreign table ${foreignTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    hostTableId = hostTable.id;

    // Created before any row exists: making a link required is only accepted
    // while nothing could already violate it.
    const requiredLink = await createField(hostTableId, {
      name: REQUIRED_LINK_FIELD,
      type: FieldType.Link,
      notNull: true,
      options: {
        foreignTableId,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });
    hostLinkFieldIds.push(requiredLink.id);
    const manyLink = await createField(hostTableId, {
      name: MANY_LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.ManyMany,
        isOneWay: true,
      },
    });

    hostLinkFieldIds.push(manyLink.id);

    const created = await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [HOST_NAME_FIELD]: HOST_ROW,
            [REQUIRED_LINK_FIELD]: { id: linkedRecordId },
            // Both rows: the renamed one is what must refresh, and the other
            // keeps the cell from being a single-value cell in disguise.
            [MANY_LINK_FIELD]: [{ id: linkedRecordId }, { id: otherRecordId }],
          },
        },
      ],
    });
    const hostRecordId = created.records[0]?.id;
    if (!hostRecordId) {
      throw new Error(`Host row was not created in ${hostTableId}`);
    }

    const readHostRow = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const fields = response.data.records[0]?.fields ?? {};
      return {
        headers: response.headers,
        required: fields[requiredLink.id] as LinkCell | undefined,
        many: (fields[manyLink.id] ?? []) as LinkCell[],
      };
    };

    const before = await readHostRow();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (!before.required?.id) {
      throw new Error(
        "the required link did not land on the host row - the fixture is not in place",
      );
    }
    if (before.many.length !== 2) {
      throw new Error(
        `the manyMany link holds ${before.many.length} rows, expected 2 - the fixture is not in place`,
      );
    }

    // The wreckage: drop the foreign key while the display column keeps its
    // old value. Found by pattern rather than by name because __fk_<id> is an
    // internal naming detail, and a case that hard-codes it would start
    // failing for a reason that has nothing to do with this bug.
    const db = fixtureDb(context.app);
    const { schema, table } = await db.physicalTable(hostTableId);
    const fkColumns = await db.query<{ attname: string }[]>(
      `SELECT a.attname
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relname = $2
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND a.attname LIKE '__fk\\_%'
        ORDER BY a.attname`,
      schema,
      table,
    );
    const fkColumn = fkColumns[0]?.attname;
    if (!fkColumn) {
      throw new Error(
        `no __fk_ column on ${schema}.${table} - the required link is not stored the way this case assumes`,
      );
    }
    const cleared = await db.execute(
      `UPDATE "${schema}"."${table}" SET "${fkColumn}" = NULL WHERE "__id" = $1`,
      hostRecordId,
    );
    if (cleared !== 1) {
      throw new Error(
        `clearing ${fkColumn} touched ${cleared} rows, expected 1 - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "sibling-link-refresh-survives-cleared-fk",
      async () => {
        // Renaming a foreign row is what puts both link display columns into
        // one refresh statement. The manyMany field is the innocent party
        // here, and watching it is what makes the failure visible: the bug is
        // about the required link, but what the user loses is this.
        await updateRecordByApi(
          foreignTableId,
          otherRecordId,
          foreignNameField.id,
          config.otherTitleAfter,
        );

        const deadline = Date.now() + config.settleTimeoutMs;
        let last: { required?: LinkCell; many: LinkCell[] } | undefined;
        for (;;) {
          last = await readHostRow();
          const refreshed = last.many.find((cell) => cell.id === otherRecordId);
          if (refreshed?.title === config.otherTitleAfter) {
            // The required link must have survived the same statement. A
            // refresh that landed by blanking it would be a different bug, and
            // one worth failing on rather than passing quietly.
            if (!last.required?.id) {
              throw new Error(
                `the manyMany link refreshed but the required link was emptied: ${JSON.stringify(last.required)}`,
              );
            }
            return { required: last.required, many: last.many };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.settlePollIntervalMs);
        }

        throw new Error(
          `the renamed title never reached the manyMany cell: after ${config.settleTimeoutMs}ms it reads ${JSON.stringify(last?.many)}, expected one entry titled "${config.otherTitleAfter}"`,
        );
      },
    );

    return {
      details: {
        foreignTableId,
        hostTableId,
        routing,
        clearedForeignKeyColumn: fkColumn,
        requiredLinkAfter: probe.required,
        manyLinkAfter: probe.many,
      },
    };
  } finally {
    // Link fields first. A manyMany link owns a junction table that depends on
    // both sides, so dropping either table while it exists fails - and the
    // leftovers accumulate in the shared seed base across runs.
    for (const fieldId of hostLinkFieldIds.reverse()) {
      try {
        await deleteField(hostTableId, fieldId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (field ${fieldId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    for (const tableId of [hostTableId, foreignTableId]) {
      if (!tableId) {
        continue;
      }
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
