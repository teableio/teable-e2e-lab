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
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ComputedOversizedCellCaseConfig } from "../types";

// A host table computing a formula over a value looked up from a source table
// -> one write that changes every source row, one of them to a value whose
// host-side result is over the size limit -> checkpoint: the ordinary host
// rows get their new values.
//
// A computed cell has a ceiling of 262144 bytes. Crossing it is a real
// constraint and that row genuinely cannot be stored. What was wrong is what
// happened to the rows that did not cross it: the task computing the batch
// failed as a unit and dead-lettered as a data-safety failure - which the
// admin console will not replay - so every other row recomputing in the same
// pass lost its value too. The write answered 200 and their cells simply
// stopped updating.
//
// Two earlier shapes of this case measured why it has to be built this way:
//
//   1. Triggering the compute by creating the formula field ran the creation
//      backfill, which never consults the ceiling: a 300000-byte computed cell
//      stored fine on both columns. Run 32649775516.
//   2. Triggering it with a write on the SAME table computed synchronously,
//      and synchronous compute fails closed by design - the write is refused,
//      on both columns. Run 32650260500.
//
// The isolation the fix adds belongs to the async worker, and work reaches
// that worker when it is past the first dependency level. So the formula lives
// in a second table reading the first through a link: the host recompute is
// level two, it goes to the outbox, and the worker is what has to survive one
// rejected cell.

const SOURCE_NAME_FIELD = "Name";
const SOURCE_NOTE_FIELD = "Note";
const HOST_NAME_FIELD = "Name";
const LINK_FIELD = "Source";
const LOOKUP_FIELD = "Source Note";
const COMPUTED_FIELD = "Repeated";
const OVERSIZED_ROW = "the-long-one";

// teable's default ceilings, in bytes. Named here so the fixture arithmetic is
// checkable against the product rather than against numbers this file made up.
// The fixture is ASCII, so a character is a byte.
const COMPUTED_CELL_LIMIT_BYTES = 262_144;
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
  let sourceTableId = "";
  let hostTableId = "";

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
  if (
    config.ordinaryValue.length * config.repeatTimes >
    COMPUTED_CELL_LIMIT_BYTES
  ) {
    throw new Error(
      "the ordinary rows would compute over the limit as well - they have to be the rows that were " +
        "never the problem",
    );
  }
  if (config.seedValue === config.ordinaryValue) {
    throw new Error(
      "the seed value and the value the ordinary rows are changed to are the same - the write would " +
        "queue no recompute and the cells would still read the seed's result",
    );
  }
  if (config.ordinaryRowCount < 1) {
    throw new Error(
      "there has to be at least one ordinary row - it is the whole observation",
    );
  }

  const oversizedValue = "x".repeat(config.oversizedChars);
  const seededExpected = config.seedValue.repeat(config.repeatTimes);
  const expectedOrdinary = config.ordinaryValue.repeat(config.repeatTimes);
  const ordinaryNames = Array.from(
    { length: config.ordinaryRowCount },
    (_, index) => `ordinary-${index}`,
  );
  const allNames = [OVERSIZED_ROW, ...ordinaryNames];

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: SOURCE_NAME_FIELD, type: FieldType.SingleLineText },
        { name: SOURCE_NOTE_FIELD, type: FieldType.LongText },
      ],
      records: allNames.map((name) => ({
        fields: {
          [SOURCE_NAME_FIELD]: name,
          [SOURCE_NOTE_FIELD]: config.seedValue,
        },
      })),
    });
    sourceTableId = sourceTable.id;
    const sourceNoteField = sourceTable.fields.find(
      (field: { name: string }) => field.name === SOURCE_NOTE_FIELD,
    );
    if (!sourceNoteField) {
      throw new Error(`Source table ${sourceTableId} is not in place`);
    }
    const sourceIdByName = new Map<string, string>(
      sourceTable.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[SOURCE_NAME_FIELD]),
          record.id,
        ],
      ),
    );

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_NAME_FIELD, type: FieldType.SingleLineText }],
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
      type: FieldType.LongText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: sourceNoteField.id,
        linkFieldId: linkField.id,
      },
    });
    // The formula lives here rather than on the source table on purpose: a
    // recompute past the first dependency level is handed to the outbox
    // worker, and the worker is the only caller that isolates an oversized
    // cell instead of failing the whole task.
    await createField(hostTableId, {
      name: COMPUTED_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `REPT({${lookupField.id}}, ${config.repeatTimes})`,
      },
    });

    // One host row per source row, named after it, so a host row that lost its
    // value can be named in the failure message.
    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: allNames.map((name) => ({
        fields: {
          [HOST_NAME_FIELD]: name,
          [LINK_FIELD]: { id: sourceIdByName.get(name) },
        },
      })),
    });

    const readHostRows = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: allNames.length,
      });
      return {
        headers: response.headers,
        rows: response.data.records.map(
          (record: { fields: Record<string, unknown> }) => ({
            name: String(record.fields[HOST_NAME_FIELD] ?? ""),
            computed: record.fields[COMPUTED_FIELD],
          }),
        ),
      };
    };

    // Fixture verification, outside the checkpoint: every host row already
    // computes the seed value. If the chain did not work on the seed, "the
    // ordinary rows lost their values" would be describing a formula that
    // never produced any.
    const settleSeed = async () => {
      const deadline = Date.now() + config.settleTimeoutMs;
      for (;;) {
        const current = await readHostRows();
        const unset = current.rows.filter(
          (row) => String(row.computed ?? "") !== seededExpected,
        );
        if (unset.length === 0 && current.rows.length === allNames.length) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `the seed values never computed through the link: ${unset.length} of ${current.rows.length} host ` +
              `rows do not read ${JSON.stringify(seededExpected)} after ${config.settleTimeoutMs}ms - ` +
              "the fixture is not in place",
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

    const probe = await bugCheckpoint(
      "ordinary-rows-still-compute",
      async () => {
        // One write covering every source row: the ordinary ones get a new
        // small value, and the long one gets a value whose host-side result is
        // over the ceiling. The host rows recompute as one worker task, which
        // is where a single rejected cell took the rest with it.
        await apiUpdateRecords(sourceTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: allNames.map((name) => ({
            id: sourceIdByName.get(name) ?? "",
            fields: {
              [SOURCE_NOTE_FIELD]:
                name === OVERSIZED_ROW ? oversizedValue : config.ordinaryValue,
            },
          })),
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let missing: string[] = [];
        let oversizedShows: unknown;
        for (;;) {
          const current = await readHostRows();
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
          `${missing.length} of ${config.ordinaryRowCount} ordinary rows never got their new computed value ` +
            `after ${config.settleTimeoutMs}ms (${missing.slice(0, 3).join(", ")}) - the one oversized row ` +
            "took the whole batch with it",
        );
      },
    );

    return {
      details: {
        sourceTableId,
        hostTableId,
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
