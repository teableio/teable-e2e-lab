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
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { WeekdayStartDayCaseConfig } from "../types";

// A column working out which day of the week a date falls on, told that weeks
// start on Monday -> checkpoint: it counts from Monday.
//
// Where the week starts is not a preference about wording. Most of the world
// works Monday to Sunday, and a column that numbers the days is used to sort
// and group by weekday - a rota, a delivery schedule, a weekly report.
//
// The instruction was ignored and every day came back numbered from Sunday.
// Everything built on the column is then off by one day, and nothing says so:
// the numbers are plausible, they are consistent with each other, and the
// error only shows if someone checks a date they know the answer for.
//
// The same date is also asked about with no instruction and with Sunday, which
// both answer the same way on either side of the fix. They are what makes the
// Monday answer readable rather than a number on its own.

const NAME_FIELD = "Name";
const DATE_FIELD = "When";
const DEFAULT_FIELD = "Day number";
const MONDAY_FIELD = "Day number, weeks from Monday";
const SUNDAY_FIELD = "Day number, weeks from Sunday";

export const runWeekdayStartDayCase = async (
  bugCase: BugCaseFor<"weekday-start-day">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: WeekdayStartDayCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.fromMonday === config.fromSunday) {
    throw new Error(
      "the two answers have to differ, or ignoring where the week starts would give the right number anyway",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: "UTC",
            },
          },
        },
      ],
      records: [
        { fields: { [NAME_FIELD]: "a-row", [DATE_FIELD]: config.date } },
      ],
    });
    tableId = table.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    const rowId = table.records?.[0]?.id;
    if (!dateFieldId || !rowId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const asDefault = await createField(tableId, {
      name: DEFAULT_FIELD,
      type: FieldType.Formula,
      options: { expression: `WEEKDAY({${dateFieldId}})` },
    });
    const fromMonday = await createField(tableId, {
      name: MONDAY_FIELD,
      type: FieldType.Formula,
      options: { expression: `WEEKDAY({${dateFieldId}}, "Monday")` },
    });
    const fromSunday = await createField(tableId, {
      name: SUNDAY_FIELD,
      type: FieldType.Formula,
      options: { expression: `WEEKDAY({${dateFieldId}}, "Sunday")` },
    });

    const readRow = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 5,
      });
      return read.data.records.find(
        (record: { id: string }) => record.id === rowId,
      )?.fields;
    };

    // Fixture verification, outside the checkpoint: the date landed. A blank
    // date would make every one of the three columns blank and say nothing
    // about where the week starts.
    let fields = await readRow();
    for (
      let attempt = 0;
      attempt < config.settleAttempts && fields?.[asDefault.id] == null;
      attempt += 1
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, config.settleIntervalMs),
      );
      fields = await readRow();
    }
    if (fields?.[dateFieldId] == null) {
      throw new Error(
        `the row holds no date: ${JSON.stringify(fields)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-day-number-counts-from-the-day-the-week-starts",
      async () => {
        const answers = {
          [DEFAULT_FIELD]: Number(fields?.[asDefault.id]),
          [MONDAY_FIELD]: Number(fields?.[fromMonday.id]),
          [SUNDAY_FIELD]: Number(fields?.[fromSunday.id]),
        };
        if (answers[MONDAY_FIELD] !== config.fromMonday) {
          throw new Error(
            `told that weeks start on Monday, the column answers ${answers[MONDAY_FIELD]} for ${config.date}, expected ${config.fromMonday}` +
              (answers[MONDAY_FIELD] === config.fromSunday
                ? " - it counted from Sunday, so everything built on this column is off by one day and nothing says so"
                : ""),
          );
        }
        // The two that answer the same either way, kept so the Monday answer
        // is read against something rather than on its own.
        if (answers[SUNDAY_FIELD] !== config.fromSunday) {
          throw new Error(
            `told that weeks start on Sunday, the column answers ${answers[SUNDAY_FIELD]}, expected ${config.fromSunday}`,
          );
        }
        if (answers[DEFAULT_FIELD] !== config.fromSunday) {
          throw new Error(
            `asked with no instruction, the column answers ${answers[DEFAULT_FIELD]}, expected ${config.fromSunday}`,
          );
        }
        return { answers };
      },
    );

    return {
      details: {
        tableId,
        date: config.date,
        answers: probe.answers,
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
