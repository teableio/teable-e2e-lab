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
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ComputedOversizedCellCaseConfig } from "../types";

// A formula over a text column, then one bulk write that changes every row -
// one of them to a value whose formula result is over the size limit ->
// checkpoint: the ordinary rows in that same write get their new values.
//
// The trigger has to be a record write, not the backfill that runs when a
// formula field is created. The ceiling is enforced in the computed pipeline's
// record-change path, and the first version of this case triggered the
// backfill instead: it stored a 300000-byte computed cell on both sides of the
// fix, because that path never consults the limit. Measured, run 32649775516.
//
// A computed cell has a ceiling. A formula that multiplies a long text value
// can cross it on one row while every other row in the table stays far below
// it - a single unusually long note, a lookup that happened to gather a lot.
//
// The computed task that produced that cell failed as a unit and dead-lettered
// as a data-safety failure, so the rows around it never got their values
// either. Nothing said so: the write answered 200, and the other cells simply
// stayed empty. The one row that is genuinely too big took the whole batch
// with it.
//
// The observation is the ordinary rows, read the way the grid reads them, and
// waiting is the assertion: a value that never arrives IS the failure, because
// there is no dead-letter table a user can see. What the oversized row itself
// ends up showing is recorded but not asserted - this case is about the rows
// that were never the problem.

const NAME_FIELD = "Name";
const SOURCE_FIELD = "Note";
const COMPUTED_FIELD = "Repeated";
const OVERSIZED_ROW = "the-long-one";

// teable's default ceiling for a computed cell, in bytes. Named here so the
// fixture arithmetic below is checkable against the product rather than
// against a number this file made up. The fixture is ASCII, so a character is
// a byte.
const COMPUTED_CELL_LIMIT_BYTES = 262_144;
// And the ceiling for an ordinary stored cell, which the source value has to
// stay under - otherwise the fixture would be refused at write time and the
// case would never reach the computed path at all.
const CELL_VALUE_LIMIT_BYTES = 262_144;

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runComputedOversizedCellCase = async (
  bugCase: BugCaseFor<"computed-oversized-cell">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ComputedOversizedCellCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  // Fixture arithmetic, before anything is built. Each of these is a way the
  // case could look like it was measuring the overflow while measuring
  // something else.
  const oversizedResultBytes = config.oversizedChars * config.repeatTimes;
  if (oversizedResultBytes <= COMPUTED_CELL_LIMIT_BYTES) {
    throw new Error(
      `${config.oversizedChars} characters repeated ${config.repeatTimes} times is ${oversizedResultBytes} bytes, ` +
        `which is within the ${COMPUTED_CELL_LIMIT_BYTES}-byte computed cell limit - nothing would overflow`,
    );
  }
  if (config.oversizedChars >= CELL_VALUE_LIMIT_BYTES) {
    throw new Error(
      `the source cell would be ${config.oversizedChars} bytes, at or over the ${CELL_VALUE_LIMIT_BYTES}-byte ` +
        "cell limit - the fixture would be refused before the formula ever ran",
    );
  }
  const ordinaryResultBytes = config.ordinaryValue.length * config.repeatTimes;
  if (ordinaryResultBytes > COMPUTED_CELL_LIMIT_BYTES) {
    throw new Error(
      `the ordinary rows would compute to ${ordinaryResultBytes} bytes, over the limit as well - ` +
        "they have to be the rows that were never the problem",
    );
  }
  if (config.seedValue === config.ordinaryValue) {
    throw new Error(
      "the seed value and the value the ordinary rows are changed to are the same - " +
        "the write would queue no recompute and the cells would still read the seed's result",
    );
  }
  if (config.ordinaryRowCount < 1) {
    throw new Error(
      "there has to be at least one ordinary row - it is the whole observation",
    );
  }

  const oversizedValue = "x".repeat(config.oversizedChars);
  const expectedOrdinary = config.ordinaryValue.repeat(config.repeatTimes);
  const ordinaryNames = Array.from(
    { length: config.ordinaryRowCount },
    (_, index) => `ordinary-${index}`,
  );

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText },
        { name: SOURCE_FIELD, type: FieldType.LongText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: OVERSIZED_ROW,
            [SOURCE_FIELD]: config.seedValue,
          },
        },
        ...ordinaryNames.map((name) => ({
          fields: { [NAME_FIELD]: name, [SOURCE_FIELD]: config.seedValue },
        })),
      ],
    });
    tableId = table.id;
    const sourceField = table.fields.find(
      (field: { name: string }) => field.name === SOURCE_FIELD,
    );
    if (!sourceField) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readRows = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.ordinaryRowCount + 1,
      });
      return {
        headers: response.headers,
        ids: response.data.records.map((record: { id: string }) => record.id),
        rows: response.data.records.map(
          (record: { fields: Record<string, unknown> }) => ({
            name: String(record.fields[NAME_FIELD] ?? ""),
            source: String(record.fields[SOURCE_FIELD] ?? ""),
            computed: record.fields[COMPUTED_FIELD],
          }),
        ),
      };
    };

    // The formula exists before the write under test, so the pass that has to
    // survive is a recompute driven by a record change rather than the
    // creation backfill.
    await createField(tableId, {
      name: COMPUTED_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `REPT({${sourceField.id}}, ${config.repeatTimes})`,
      },
    });

    // Fixture verification, outside the checkpoint: every row is seeded, and
    // every row already computes. If the formula did not work on the seed
    // values, "the ordinary rows lost their values" would be describing a
    // formula that never produced any.
    const seededExpected = config.seedValue.repeat(config.repeatTimes);
    const settleSeed = async () => {
      const deadline = Date.now() + config.settleTimeoutMs;
      for (;;) {
        const current = await readRows();
        const unset = current.rows.filter(
          (row) => String(row.computed ?? "") !== seededExpected,
        );
        if (
          unset.length === 0 &&
          current.rows.length === config.ordinaryRowCount + 1
        ) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `the seed values never computed: ${unset.length} of ${current.rows.length} rows do not read ` +
              `${JSON.stringify(seededExpected)} after ${config.settleTimeoutMs}ms - the fixture is not in place`,
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
    const recordIdByName = new Map(
      seeded.rows.map((row, index) => [row.name, seeded.ids[index]]),
    );

    const probe = await bugCheckpoint(
      "ordinary-rows-still-compute",
      async () => {
        // One write covering every row: the ordinary ones get a new small
        // value, and the long one gets a value whose formula result is over
        // the ceiling. They recompute as one batch, which is where a single
        // rejected cell took the rest with it.
        await apiUpdateRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: [
            {
              id: recordIdByName.get(OVERSIZED_ROW) ?? "",
              fields: { [SOURCE_FIELD]: oversizedValue },
            },
            ...ordinaryNames.map((name) => ({
              id: recordIdByName.get(name) ?? "",
              fields: { [SOURCE_FIELD]: config.ordinaryValue },
            })),
          ],
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let missing: string[] = [];
        let oversizedShows: unknown;
        for (;;) {
          const current = await readRows();
          oversizedShows = current.rows.find(
            (row) => row.name === OVERSIZED_ROW,
          )?.computed;
          missing = ordinaryNames.filter((name) => {
            const row = current.rows.find(
              (candidate) => candidate.name === name,
            );
            return String(row?.computed ?? "") !== expectedOrdinary;
          });
          if (missing.length === 0) {
            return { oversizedShows };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.settlePollIntervalMs);
        }

        throw new Error(
          `${missing.length} of ${config.ordinaryRowCount} ordinary rows never got their new computed value after ` +
            `${config.settleTimeoutMs}ms (${missing.slice(0, 3).join(", ")}) - the one oversized row took the ` +
            "whole batch with it",
        );
      },
    );

    return {
      details: {
        tableId,
        routing,
        oversizedChars: config.oversizedChars,
        repeatTimes: config.repeatTimes,
        oversizedResultBytes,
        computedCellLimitBytes: COMPUTED_CELL_LIMIT_BYTES,
        ordinaryRowCount: config.ordinaryRowCount,
        // Recorded, not asserted: what the row that is genuinely too big ends
        // up showing is a separate question from whether its neighbours
        // computed.
        oversizedRowComputed:
          typeof probe.oversizedShows === "string"
            ? `${probe.oversizedShows.length} characters`
            : JSON.stringify(probe.oversizedShows ?? null),
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
