import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  CONVERT_FIELD,
  getRecords as apiGetRecords,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NullMultiplicityLookupCaseConfig } from "../types";

// A scalar lookup whose `is_multiple_cell_value` is NULL rather than false ->
// either recompute it or convert it away -> checkpoint: whichever was asked
// for actually works.
//
// A lookup with unset multiplicity was read as MULTI-valued. Computed updates
// therefore projected jsonb into a column that is plain TEXT, and Postgres
// answered `operator does not exist: text = jsonb`. The failure classified as
// computed_code_bug - not retryable - so it went straight to the dead letter
// table, and every later edit produced another one. On the reporting instance
// 33 computed fields on one table sat red permanently.
//
// The second half is what makes it more than an outage. The obvious way out
// from inside the product - convert the broken lookup into a plain text field
// - hit the same wrong assumption from the other side: the conversion ran
// jsonb_typeof over plain text and answered `invalid input syntax for type
// json`. The table could not compute and could not be repaired, and no
// sequence of user actions led anywhere.
//
// Hence two cases over this runner, one per observation. Both flip on the same
// fix, and that is fine: they are separate rows because they are separate
// things a user loses, and the report should say which half came back.

const FOREIGN_TITLE_FIELD = "Related title";
const HOST_TITLE_FIELD = "Host title";
const LINK_FIELD = "Related";
const LOOKUP_FIELD = "Related title lookup";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runNullMultiplicityLookupCase = async (
  bugCase: BugCaseFor<"null-multiplicity-lookup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NullMultiplicityLookupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let foreignTableId = "";
  let hostTableId = "";

  if (config.sourceValue === config.sourceValueAfter) {
    throw new Error(
      "sourceValue and sourceValueAfter are identical - the upstream edit would be a no-op, no recompute would run, and the case would read the first backfill and pass",
    );
  }

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [{ name: FOREIGN_TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [FOREIGN_TITLE_FIELD]: config.sourceValue } }],
    });
    foreignTableId = foreignTable.id;
    const foreignTitleField = foreignTable.fields.find(
      (field: { name: string }) => field.name === FOREIGN_TITLE_FIELD,
    );
    const foreignRecordId = foreignTable.records[0]?.id;
    if (!foreignTitleField || !foreignRecordId) {
      throw new Error(`Foreign table ${foreignTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    hostTableId = hostTable.id;

    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });
    const lookupField = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      lookupOptions: {
        foreignTableId,
        lookupFieldId: foreignTitleField.id,
        linkFieldId: linkField.id,
      },
    });

    const created = await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [HOST_TITLE_FIELD]: "host",
            [LINK_FIELD]: { id: foreignRecordId },
          },
        },
      ],
    });
    const hostRecordId = created.records[0]?.id;
    if (!hostRecordId) {
      throw new Error(`Host row was not created in ${hostTableId}`);
    }

    const readLookupCell = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        headers: response.headers,
        cell: response.data.records[0]?.fields?.[lookupField.id],
      };
    };

    const waitForCell = async (expected: string) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let last: unknown;
      for (;;) {
        last = (await readLookupCell()).cell;
        if (last === expected) {
          return { ok: true as const, last };
        }
        if (Date.now() >= deadline) {
          return { ok: false as const, last };
        }
        await sleep(config.settlePollIntervalMs);
      }
    };

    // Fixture verification, outside the checkpoint: the lookup resolves before
    // anything is touched, and v2 is serving the read.
    const seeded = await waitForCell(config.sourceValue);
    const routing = assertServedByV2((await readLookupCell()).headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (!seeded.ok) {
      throw new Error(
        `the lookup reads ${JSON.stringify(seeded.last)} before the drift, expected "${config.sourceValue}" - the fixture is not in place`,
      );
    }

    // The historical state, in two halves: the physical column is scalar TEXT,
    // and the metadata has no multiplicity at all. A lookup created today is
    // stored as jsonb, so the column is converted down first - the fixture is
    // a table that predates that, not one this code would build.
    const db = fixtureDb(context.app);
    const { schema, table: physicalTable } =
      await db.physicalTable(hostTableId);
    const lookupColumn = await db.physicalColumn(lookupField.id);
    const columnTypes = await db.query<{ data_type: string }[]>(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
      schema,
      physicalTable,
      lookupColumn,
    );
    const columnType = columnTypes[0]?.data_type;
    if (!columnType) {
      throw new Error(
        `no column ${lookupColumn} on ${schema}.${physicalTable} - the fixture is not in place`,
      );
    }
    if (columnType !== "text") {
      await db.execute(
        `ALTER TABLE "${schema}"."${physicalTable}"
         ALTER COLUMN "${lookupColumn}" TYPE text
         USING (
           CASE
             WHEN jsonb_typeof("${lookupColumn}"::jsonb) = 'array'
               THEN "${lookupColumn}"::jsonb ->> 0
             WHEN jsonb_typeof("${lookupColumn}"::jsonb) = 'string'
               THEN "${lookupColumn}"::jsonb #>> '{}'
             ELSE NULLIF("${lookupColumn}"::text, '')
           END
         )`,
      );
    }
    const drifted = await db.execute(
      `UPDATE "field" SET "db_field_type" = 'TEXT', "is_multiple_cell_value" = NULL
        WHERE "id" = $1`,
      lookupField.id,
    );
    if (drifted !== 1) {
      throw new Error(
        `the multiplicity drift touched ${drifted} rows, expected 1 - the fixture is not in place`,
      );
    }

    // The scalar value has to have survived the column rewrite, or the
    // observations below would be reading an empty cell for the wrong reason.
    const stored = await db.query<{ v: string | null }[]>(
      `SELECT "${lookupColumn}" AS v FROM "${schema}"."${physicalTable}" WHERE "__id" = $1`,
      hostRecordId,
    );
    if (stored[0]?.v !== config.sourceValue) {
      throw new Error(
        `the stored lookup value is ${JSON.stringify(stored[0]?.v)} after the column rewrite, expected "${config.sourceValue}" - the fixture is not in place`,
      );
    }

    if (config.observe === "recompute") {
      const probe = await bugCheckpoint(
        "scalar-lookup-refreshes-with-null-multiplicity",
        async () => {
          // A real edit upstream. Writing the same title back queues nothing,
          // and the case would read the value the pre-drift pass left behind.
          await updateRecordByApi(
            foreignTableId,
            foreignRecordId,
            foreignTitleField.id,
            config.sourceValueAfter,
          );
          const after = await waitForCell(config.sourceValueAfter);
          if (!after.ok) {
            throw new Error(
              `the refreshed title never reached the lookup: after ${config.settleTimeoutMs}ms it reads ${JSON.stringify(after.last)}, expected "${config.sourceValueAfter}"`,
            );
          }
          return { cell: after.last };
        },
      );
      return {
        details: {
          foreignTableId,
          hostTableId,
          routing,
          lookupFieldId: lookupField.id,
          physicalColumnType: columnType,
          observe: config.observe,
          lookupAfter: probe.cell,
        },
      };
    }

    // observe === "convert-to-text": the way out from inside the product.
    const probe = await bugCheckpoint(
      "drifted-lookup-converts-to-text",
      async () => {
        // Raw axios: pre-fix this answers 500, and the generated client would
        // throw away the response and its routing headers with it.
        const response = await axios.put(
          urlBuilder(CONVERT_FIELD, {
            tableId: hostTableId,
            fieldId: lookupField.id,
          }),
          { type: FieldType.SingleLineText },
          { validateStatus: () => true },
        );
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data ?? "");
        // Asserted inside the checkpoint rather than before it: the engine
        // check belongs to the request under test, and this request is the
        // observation. A non-v2 answer here throws as a reproduction, which is
        // the conservative direction - it never reads as "the bug is gone".
        assertServedByV2(response.headers, {
          operation: "PUT /table/{tableId}/field/{fieldId}/convert",
          feature: "convertField",
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `converting the drifted lookup to text answered ${response.status}: ${body}`,
          );
        }
        const converted = (
          response.data as {
            fields?: { id: string; type?: string; isLookup?: boolean }[];
          }
        )?.fields?.find((field) => field.id === lookupField.id);
        if (
          converted &&
          (converted.type !== FieldType.SingleLineText || converted.isLookup)
        ) {
          throw new Error(
            `the convert answered ${response.status} but the field is still ${JSON.stringify(converted)}`,
          );
        }
        return { status: response.status, converted };
      },
    );

    return {
      details: {
        foreignTableId,
        hostTableId,
        routing,
        lookupFieldId: lookupField.id,
        physicalColumnType: columnType,
        observe: config.observe,
        convertStatus: probe.status,
        convertedField: probe.converted,
      },
    };
  } finally {
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
