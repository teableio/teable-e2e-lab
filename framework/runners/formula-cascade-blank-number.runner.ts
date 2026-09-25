import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecord as apiGetRecord,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import {
  assertHybridComputedRuntime,
  assertServedByV2,
  labComputedUpdateMode,
} from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormulaCascadeBlankNumberCaseConfig } from "../types";

// Three formulas, each built on the one before: a rounded number or a blank,
// then that parsed back to a number or a placeholder, then half of it ->
// change the input so the first one goes from blank to a number and back ->
// checkpoint: all three follow.
//
// The first formula answers text: a rounded number when the input is above
// zero, an empty string otherwise. Worked out together in one pass, its
// intermediate value was a number while the next formula compared it with an
// empty string as text, and the database refused to read "" as a number. The
// whole update failed, so the formulas further down kept whatever they held
// before - a stale number that nothing flags.
//
// The case reads the three results after each edit and waits for them to
// arrive, so under the hybrid strategy the background pass has time to run.

const NAME_FIELD = "Name";
const INTERVAL_FIELD = "Interval";
const PREVIOUS_FIELD = "Previous";
const CURRENT_FIELD = "Current";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runFormulaCascadeBlankNumberCase = async (
  bugCase: BugCaseFor<"formula-cascade-blank-number">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormulaCascadeBlankNumberCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (bugCase.computedUpdateMode === "hybrid") {
    assertHybridComputedRuntime(bugCase.id);
  }

  // What the three formulas should read for a given interval, worked out
  // locally the way the expressions do.
  const expectedFor = (interval: number) => {
    if (interval > 0) {
      const rounded = Math.round(interval + config.previous - config.current);
      return { upstream: String(rounded), parsed: rounded, half: rounded / 2 };
    }
    return {
      upstream: null,
      parsed: config.sentinel,
      half: config.sentinel / 2,
    };
  };

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: INTERVAL_FIELD, type: FieldType.Number },
        { name: PREVIOUS_FIELD, type: FieldType.Number },
        { name: CURRENT_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "sample",
            [INTERVAL_FIELD]: 0,
            [PREVIOUS_FIELD]: config.previous,
            [CURRENT_FIELD]: config.current,
          },
        },
      ],
    });
    tableId = table.id;
    const recordId = table.records[0]?.id as string;
    const fieldId = (name: string) =>
      table.fields.find((field: { name: string }) => field.name === name)
        ?.id as string;
    const interval = fieldId(INTERVAL_FIELD);
    const previous = fieldId(PREVIOUS_FIELD);
    const current = fieldId(CURRENT_FIELD);

    // One at a time, each on the one before, so none of them is filled in as
    // part of creating the next.
    const upstream = await createField(tableId, {
      name: "Rounded or blank",
      type: FieldType.Formula,
      options: {
        expression: `IF({${interval}}>0,ROUND({${interval}}+{${previous}}-{${current}},0),"")`,
      },
    });
    const parsed = await createField(tableId, {
      name: "Parsed or placeholder",
      type: FieldType.Formula,
      options: {
        expression: `IF({${upstream.id}}!="",INT({${upstream.id}}),${config.sentinel})`,
      },
    });
    const half = await createField(tableId, {
      name: "Half",
      type: FieldType.Formula,
      options: { expression: `{${parsed.id}}/2` },
    });

    const read = async () => {
      const response = await apiGetRecord(tableId, recordId, {
        fieldKeyType: FieldKeyType.Id,
      });
      const fields = response.data.fields as Record<string, unknown>;
      return {
        headers: response.headers,
        values: {
          upstream: (fields[upstream.id] ?? null) as unknown,
          parsed: (fields[parsed.id] ?? null) as unknown,
          half: (fields[half.id] ?? null) as unknown,
        },
      };
    };
    const waitFor = async (expected: ReturnType<typeof expectedFor>) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let last = await read();
      while (JSON.stringify(last.values) !== JSON.stringify(expected)) {
        if (Date.now() >= deadline) {
          return { settled: false, last };
        }
        await sleep(config.pollIntervalMs);
        last = await read();
      }
      return { settled: true, last };
    };

    // Fixture verification, outside the checkpoint: the three formulas are
    // in place and read the blank branch for the starting interval of 0.
    const start = await waitFor(expectedFor(0));
    if (!start.settled) {
      throw new Error(
        `with the interval at 0 the formulas read ${JSON.stringify(start.last.values)}, expected ` +
          `${JSON.stringify(expectedFor(0))} - the fixture is not in place`,
      );
    }

    // The engine, proved on the same kind of write the checkpoint makes: an
    // edit to the row, here to its name, which no formula reads. Outside the
    // checkpoint so a v1 answer is an error rather than a reproduction.
    const renamed = await apiUpdateRecord(tableId, recordId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [fieldId(NAME_FIELD)]: "sample row" } },
    });
    const routing = assertServedByV2(renamed.headers, {
      operation: "PATCH /table/{tableId}/record/{recordId}",
      feature: "updateRecord",
    });

    const probe = await bugCheckpoint(
      "every-formula-follows-a-blank-turning-into-a-number-and-back",
      async () => {
        const steps: { interval: number; values: unknown }[] = [];
        for (const next of config.intervals) {
          await apiUpdateRecord(tableId, recordId, {
            fieldKeyType: FieldKeyType.Id,
            record: { fields: { [interval]: next } },
          });
          const expected = expectedFor(next);
          const result = await waitFor(expected);
          steps.push({ interval: next, values: result.last.values });
          if (!result.settled) {
            throw new Error(
              `after setting the interval to ${next}, the three formulas read ` +
                `${JSON.stringify(result.last.values)} for ${config.settleTimeoutMs}ms, expected ` +
                `${JSON.stringify(expected)} - steps so far ${JSON.stringify(steps)}`,
            );
          }
        }
        return { steps };
      },
    );

    return {
      details: {
        tableId,
        computedUpdateMode: labComputedUpdateMode(),
        routing,
        steps: probe.steps,
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
