import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecords as apiUpdateRecords,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DanglingComputedSourceCaseConfig } from "../types";

// A lookup pointing at a field that is no longer there, on a table that is
// still being edited -> edit it -> checkpoint: the edit lands and the row
// reads back.
//
// When a field that other fields read is deleted, the dependents are supposed
// to be marked broken so the engine knows to leave them alone. Older delete
// paths did not always do that, so bases carry lookups and rollups aimed at a
// field nobody can find - and nothing marks them, because the marking is
// exactly what did not happen.
//
// Generating SQL for one of those answered "Field not found" and killed the
// computed task it belonged to, classified as an obsolete plan and not
// retried. The table it lived on stopped keeping up: the one broken column
// took every other computed column on the table with it, and a plain edit
// stopped settling.
//
// The dangling reference is written with SQL because that is what it is - the
// residue of a delete path that no longer runs. Asking the product to delete
// the field today marks the dependents correctly and produces a different,
// working state. See framework/fixture-db.ts.

const SOURCE_NAME_FIELD = "Name";
const SOURCE_VALUE_FIELD = "Amount";
const HOST_NAME_FIELD = "Name";
const LINK_FIELD = "Source";
const LOOKUP_FIELD = "Amount Lookup";
const HOST_ROW = "host-row";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runDanglingComputedSourceCase = async (
  bugCase: BugCaseFor<"dangling-computed-source">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DanglingComputedSourceCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let sourceTableId = "";
  let hostTableId = "";

  if (config.editedTitle === HOST_ROW) {
    throw new Error(
      "the edited title has to differ from the seeded one - writing the same value back would settle " +
        "without the row ever changing",
    );
  }

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        {
          name: SOURCE_NAME_FIELD,
          type: FieldType.SingleLineText,
          isPrimary: true,
        },
        { name: SOURCE_VALUE_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [SOURCE_NAME_FIELD]: "source-row",
            [SOURCE_VALUE_FIELD]: config.sourceAmount,
          },
        },
      ],
    });
    sourceTableId = sourceTable.id;
    const sourceValueFieldId = sourceTable.fields.find(
      (field: { name: string }) => field.name === SOURCE_VALUE_FIELD,
    )?.id;
    const sourceRecordId = sourceTable.records[0]?.id;
    if (!sourceValueFieldId || !sourceRecordId) {
      throw new Error(`Source table ${sourceTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        {
          name: HOST_NAME_FIELD,
          type: FieldType.SingleLineText,
          isPrimary: true,
        },
      ],
      records: [],
    });
    hostTableId = hostTable.id;

    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: sourceTableId,
        relationship: Relationship.ManyOne,
      },
    });
    const lookupField = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: sourceValueFieldId,
        linkFieldId: linkField.id,
      },
    });
    const created = await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [HOST_NAME_FIELD]: HOST_ROW,
            [LINK_FIELD]: { id: sourceRecordId },
          },
        },
      ],
    });
    const hostRecordId = created.records?.[0]?.id;
    if (!hostRecordId) {
      throw new Error(
        `the host row was not created: ${JSON.stringify(created)}`,
      );
    }

    const readHost = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      const record = response.data.records[0];
      return {
        headers: response.headers,
        title: String(record?.fields[HOST_NAME_FIELD] ?? ""),
        lookup: record?.fields[LOOKUP_FIELD],
      };
    };

    // Fixture verification, outside the checkpoint: the lookup resolved before
    // anything was broken. A lookup that never worked would make "the table
    // stopped keeping up" describe something that was never up.
    const settle = async () => {
      const deadline = Date.now() + config.settleTimeoutMs;
      for (;;) {
        const current = await readHost();
        if (Number(current.lookup) === config.sourceAmount) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `the lookup reads ${JSON.stringify(current.lookup)} after ${config.settleTimeoutMs}ms, expected ` +
              `${config.sourceAmount} - the fixture is not in place`,
          );
        }
        await sleep(config.pollIntervalMs);
      }
    };
    const before = await settle();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    // The residue of the old delete path: the source field is gone and the
    // lookup that reads it was left pointing at it, unmarked.
    const db = fixtureDb(context.app);
    const removed = await db.execute(
      `UPDATE "field" SET "deleted_time" = NOW() WHERE "id" = $1`,
      sourceValueFieldId,
    );
    if (removed !== 1) {
      throw new Error(
        `deleting ${sourceValueFieldId} behind the product's back touched ${removed} rows, expected 1`,
      );
    }
    const dependent = await db.query<{ has_error: boolean | null }[]>(
      `SELECT "has_error" FROM "field" WHERE "id" = $1`,
      lookupField.id,
    );
    if (dependent[0]?.has_error === true) {
      throw new Error(
        `the lookup was marked broken by the fixture itself - the state under test is the one where ` +
          "nothing marked it",
      );
    }

    const probe = await bugCheckpoint(
      "table-with-a-dangling-lookup-still-edits",
      async () => {
        // An ordinary edit to an ordinary column. It has nothing to do with
        // the lookup, which is the point: the broken column should not be able
        // to stop it.
        await apiUpdateRecords(hostTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: [
            {
              id: hostRecordId,
              fields: { [HOST_NAME_FIELD]: config.editedTitle },
            },
          ],
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let last = "";
        for (;;) {
          const current = await readHost();
          last = current.title;
          if (last === config.editedTitle) {
            return { title: last, lookup: current.lookup };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.pollIntervalMs);
        }
        throw new Error(
          `the edit never settled: after ${config.settleTimeoutMs}ms the row still reads ${JSON.stringify(last)}, ` +
            `expected ${JSON.stringify(config.editedTitle)} - the dangling lookup took the whole table's ` +
            "computed work with it",
        );
      },
    );

    return {
      details: {
        sourceTableId,
        hostTableId,
        routing,
        deletedSourceFieldId: sourceValueFieldId,
        lookupFieldId: lookupField.id,
        titleAfterEdit: probe.title,
        // Recorded, not asserted: what a lookup with no source left shows is a
        // separate question from whether the table still works.
        lookupAfterEdit: probe.lookup ?? null,
      },
    };
  } finally {
    for (const tableId of [hostTableId, sourceTableId]) {
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
