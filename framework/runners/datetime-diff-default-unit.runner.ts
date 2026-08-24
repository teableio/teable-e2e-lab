import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
} from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DatetimeDiffDefaultUnitCaseConfig } from "../types";

// A formula measuring the gap between two dates, written without saying in
// what -> checkpoint: the number is in the unit the formula language promises.
//
// Writing the gap between two dates without naming a unit is the short form
// everyone writes first, and the language it is copied from answers in
// seconds. Answering in days instead is not a rounding difference: it is the
// same number divided by 86,400, so a gap of two days reads as 2 where 172,800
// was meant.
//
// Nothing marks it as wrong. A column of small numbers looks like a column of
// small numbers, and whatever it feeds - a threshold, a total, a chart - is
// wrong by a factor nobody would guess at from the values.

const NAME_FIELD = "Name";
const START_FIELD = "Started";
const END_FIELD = "Finished";
const GAP_FIELD = "Gap";

export const runDatetimeDiffDefaultUnitCase = async (
  bugCase: BugCaseFor<"datetime-diff-default-unit">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DatetimeDiffDefaultUnitCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const startedAt = new Date(config.started);
  const finishedAt = new Date(config.finished);
  const seconds = Math.round(
    (finishedAt.getTime() - startedAt.getTime()) / 1000,
  );
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(
      "the fixture needs a finish after the start, or the gap is zero and every unit gives the same answer",
    );
  }
  const days = seconds / 86_400;
  if (Number.isInteger(days) === false) {
    throw new Error(
      "the gap has to be a whole number of days, so the wrong answer is a clean number and cannot be " +
        "mistaken for rounding",
    );
  }

  try {
    const dateColumn = (name: string) => ({
      name,
      type: FieldType.Date,
      options: {
        formatting: {
          date: DateFormattingPreset.ISO,
          time: TimeFormatting.Hour24,
          timeZone: config.timeZone,
        },
      },
    });

    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        dateColumn(START_FIELD),
        dateColumn(END_FIELD),
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.rowTitle,
            [START_FIELD]: config.started,
            [END_FIELD]: config.finished,
          },
        },
      ],
    });
    tableId = table.id;
    const fieldId = (name: string) =>
      table.fields.find((field: { name: string }) => field.name === name)?.id;
    const startFieldId = fieldId(START_FIELD);
    const endFieldId = fieldId(END_FIELD);
    if (!startFieldId || !endFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // No unit named - the short form, and the one whose meaning is fixed by
    // the language rather than by the person writing it.
    await createField(tableId, {
      name: GAP_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `DATETIME_DIFF({${endFieldId}}, {${startFieldId}})`,
      },
    });

    const probe = await bugCheckpoint(
      "a-gap-between-two-dates-comes-back-in-seconds",
      async () => {
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 1,
        });
        const routing = assertServedByV2(read.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const raw = read.data.records[0]?.fields[GAP_FIELD];
        const value = typeof raw === "string" ? Number(raw) : raw;
        if (typeof value !== "number" || Number.isNaN(value)) {
          throw new Error(
            `the gap reads ${JSON.stringify(raw)}, which is not a number`,
          );
        }
        if (Math.abs(value - seconds) > 1) {
          throw new Error(
            `the gap between ${config.started} and ${config.finished} reads ${value}, expected ${seconds}` +
              (Math.abs(value - days) <= 1
                ? ` - that is the gap in days, the same number divided by 86,400, and nothing marks it as ` +
                  "the wrong unit"
                : ""),
          );
        }
        return { routing, value };
      },
    );

    return {
      details: { tableId, expectedSeconds: seconds, gap: probe.value },
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
