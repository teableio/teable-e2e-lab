import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ComputedValueLandsCaseConfig } from "../types";

// Source table holding one text value -> host table linking to it, looking it
// up, and running a scalar formula over the lookup -> touch the source value
// -> checkpoint: the formula's result arrives on the host row.
//
// Everything here is public API, including the observation, and that is the
// point. The failure is a computed UPDATE that Postgres rejects (a jsonb array
// cast to double precision), which the pipeline retries and then dead-letters.
// None of that reaches the caller: the write answers 200, the row simply never
// updates. So the case waits for the value the way the user's grid does, and a
// value that never arrives IS the bug — no dead-letter table to read, no
// internal queue to drain.
//
// Waiting is therefore load-bearing rather than incidental. The timeout is the
// assertion: too short and a slow-but-working pipeline reads as the bug; long
// enough and "never" is the only thing that fails.

const SOURCE_TITLE_FIELD = "Title";
const HOST_NAME_FIELD = "Name";
const LINK_FIELD = "Rates";
const LOOKUP_FIELD = "Rate Titles";
const FORMULA_FIELD = "Conversion Rate";
const HOST_ROW = "contract-1";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runComputedValueLandsCase = async (
  bugCase: BugCaseFor<"computed-value-lands">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ComputedValueLandsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let sourceTableId = "";
  let hostTableId = "";

  const expected = Number(config.sourceValueAfter);
  if (!Number.isFinite(expected)) {
    throw new Error(
      `sourceValueAfter "${config.sourceValueAfter}" is not a number - the formula's expected result is undefined`,
    );
  }
  if (config.sourceValue === config.sourceValueAfter) {
    throw new Error(
      "sourceValue and sourceValueAfter are identical - the write would be a no-op, no recompute would run, and the case would read the first backfill and pass",
    );
  }

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [{ name: SOURCE_TITLE_FIELD, type: FieldType.SingleLineText }],
      // Stored as TEXT on purpose: the value reaches the formula through a
      // json-array lookup, and it is the text-in-json-array shape that the
      // failing cast could not read. A number field here would store a number
      // and the case would be about something else.
      records: [{ fields: { [SOURCE_TITLE_FIELD]: config.sourceValue } }],
    });
    sourceTableId = sourceTable.id;
    const sourceTitleField = sourceTable.fields.find(
      (field: { name: string }) => field.name === SOURCE_TITLE_FIELD,
    );
    const sourceRecordId = sourceTable.records[0]?.id;
    if (!sourceTitleField || !sourceRecordId) {
      throw new Error(`Source table ${sourceTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    hostTableId = hostTable.id;

    // oneMany, so the link and its lookup are stored as json arrays - the
    // storage shape the failing cast tripped over.
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: sourceTableId,
        relationship: Relationship.OneMany,
      },
    });

    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [HOST_NAME_FIELD]: HOST_ROW,
            [LINK_FIELD]: [{ id: sourceRecordId }],
          },
        },
      ],
    });

    const lookupField = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: sourceTitleField.id,
        linkFieldId: linkField.id,
      },
    });

    // VALUE() over a multi-value lookup: single-valued number result, read out
    // of a json array. Creating it after the row exists means the first
    // computed pass is a backfill, which is where the production failure was
    // reported from.
    const formulaField = await createField(hostTableId, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `VALUE({${lookupField.id}})` },
    });

    const readHostRow = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        headers: response.headers,
        value: response.data.records[0]?.fields?.[formulaField.id],
      };
    };

    // Fixture verification, outside the checkpoint: the host row exists, the
    // lookup resolved, and v2's getRecords answered. Everything below reads
    // "did the computed value arrive", which is unaskable if the row itself is
    // not there or a different engine is answering.
    const seeded = await readHostRow();
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint("computed-value-arrives", async () => {
      // Change the source value - a real change, not a rewrite of the same
      // string. A no-op write queues no computed task, and the cell would
      // still hold the value the first backfill put there.
      await updateRecordByApi(
        sourceTableId,
        sourceRecordId,
        sourceTitleField.id,
        config.sourceValueAfter,
      );

      const deadline = Date.now() + config.settleTimeoutMs;
      let last: unknown;
      for (;;) {
        last = (await readHostRow()).value;
        if (typeof last === "number" && Math.abs(last - expected) < 1e-9) {
          return { value: last };
        }
        if (Date.now() >= deadline) {
          break;
        }
        await sleep(config.settlePollIntervalMs);
      }

      throw new Error(
        `the formula over the linked value never landed: after ${config.settleTimeoutMs}ms the cell reads ${JSON.stringify(last)}, expected ${expected}`,
      );
    });

    return {
      details: {
        sourceTableId,
        hostTableId,
        routing,
        sourceValue: config.sourceValue,
        sourceValueAfter: config.sourceValueAfter,
        expected,
        observed: probe.value,
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
