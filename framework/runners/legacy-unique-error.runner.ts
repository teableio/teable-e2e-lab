import { FieldKeyType, FieldType } from "@teable/core";
import { axios, CREATE_RECORD, urlBuilder } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LegacyUniqueErrorCaseConfig } from "../types";

// A table carrying a unique index named the way v1 named them -> create a row
// that duplicates an existing value -> checkpoint: the 400 says which field.
//
// v2 read the offending field out of the constraint name, and only understood
// its own form, `${table}_${column}_unique`. v1 named its indexes
// `${schema}_${table}___${fieldId}_unique`, lowercased and truncated to 63
// bytes, so on any table whose unique index predates v2 the parse produced
// nothing and the message rendered with an empty field name:
// `Cannot complete insert: field  must have a unique value` - no details, no
// i18n payload.
//
// That is not a cosmetic loss. An external sync service branched on the v1
// error to recognise "this email already exists" and fall back; the new
// shapeless message was unrecognisable, so it retried instead - roughly a
// thousand times over six hours, with the table's create success rate at zero
// for two days before anyone connected the dashboard to it.
//
// The index is built with SQL because it is history, not a state the product
// will produce on request: v2 does not name indexes this way any more, so the
// only tables that carry one are those that lived through v1. Everything
// observed is public API - one create, and what the server said about it.

const FIELD_NAME = "Email";

// v1's FieldService.getFieldUniqueKeyName: a `___<fieldId>_unique` suffix, the
// schema and table joined in front of it, the whole thing lowercased and
// clipped to Postgres's 63-byte identifier limit.
export const legacyUniqueIndexName = (
  schema: string,
  table: string,
  fieldId: string,
): string => {
  const suffix = `___${fieldId}_unique`;
  const prefix = `${schema}_${table}`.slice(0, 63 - suffix.length);
  return `${prefix.toLowerCase()}${suffix.toLowerCase()}`;
};

export const runLegacyUniqueErrorCase = async (
  bugCase: BugCaseFor<"legacy-unique-error">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LegacyUniqueErrorCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [{ name: FIELD_NAME, type: FieldType.SingleLineText }],
      records: [{ fields: { [FIELD_NAME]: config.duplicateValue } }],
    });
    tableId = table.id;
    const field = table.fields.find(
      (candidate: { name: string }) => candidate.name === FIELD_NAME,
    );
    if (!field) {
      throw new Error(`Table ${tableId} has no ${FIELD_NAME} field`);
    }

    // The history: a unique index under v1's naming. The field metadata is
    // deliberately left alone - a migrated table carries the physical index
    // whether or not anything in v2's metadata says "unique", and it is the
    // index that raises 23505.
    const db = fixtureDb(context.app);
    const { schema, table: physicalTable } = await db.physicalTable(tableId);
    const column = await db.physicalColumn(field.id);
    const indexName = legacyUniqueIndexName(schema, physicalTable, field.id);
    await db.execute(
      `CREATE UNIQUE INDEX "${indexName}" ON "${schema}"."${physicalTable}" ("${column}")`,
    );

    // Fixture verification, outside the checkpoint: the index is really there
    // and really carries the legacy name. If it is not, the create below would
    // simply succeed and the case would report a pass having asked nothing.
    const indexes = await db.query<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = $2 AND indexname = $3`,
      schema,
      physicalTable,
      indexName,
    );
    if (indexes.length !== 1) {
      throw new Error(
        `the legacy unique index ${indexName} is not on ${schema}.${physicalTable} - the fixture is not in place`,
      );
    }

    // The request under test, sent through raw axios with `validateStatus`
    // open: the generated client raises HttpError on non-2xx, which keeps the
    // status and body but drops the response and its routing headers. This
    // case is entirely about a request that fails, so that is the only way to
    // prove v2 served the call the case depends on.
    const response = await axios.post(
      urlBuilder(CREATE_RECORD, { tableId }),
      {
        fieldKeyType: FieldKeyType.Name,
        records: [{ fields: { [FIELD_NAME]: config.duplicateValue } }],
      },
      { validateStatus: () => true },
    );
    const status = response.status;
    const body =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data ?? "");
    const routing = assertServedByV2(response.headers, {
      operation: "POST /table/{tableId}/record",
      feature: "createRecord",
    });

    const probe = await bugCheckpoint(
      "unique-violation-names-the-field",
      async () => {
        // The duplicate has to be refused at all. A 2xx would mean the index
        // is not doing its job and there is no error to inspect; a 5xx is not
        // a conflict an integration can branch on.
        if (status < 400 || status >= 500) {
          throw new Error(
            `inserting a duplicate value answered ${status}, expected a 4xx conflict: ${body}`,
          );
        }
        // And it has to say WHICH field. Either identifier is enough - the
        // name is what a person reads, the id is what an integration matches
        // on - but a message carrying neither is the bug: it is the same
        // rejection with the one piece of information the caller needed
        // removed.
        const namesField = body.includes(FIELD_NAME) || body.includes(field.id);
        if (!namesField) {
          throw new Error(
            `the unique-violation error names no field (expected "${FIELD_NAME}" or ${field.id} somewhere in it): ${body}`,
          );
        }
        return { status, body };
      },
    );

    return {
      details: {
        tableId,
        fieldId: field.id,
        legacyIndexName: indexName,
        routing,
        rejectedWith: probe.status,
        serverMessage: probe.body,
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
