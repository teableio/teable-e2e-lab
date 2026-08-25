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
import type { FromnowUnitCaseConfig } from "../types";

// A column saying how long ago a date was, asked for in days -> checkpoint: it
// answers in days.
//
// "How many days since we heard from them", "how old is this ticket" - the
// unit is the question. Nobody asks how long ago something was and means
// seconds; the whole point of naming a unit is to get a number a person can
// read at a glance and compare against a policy: chase after 30 days, escalate
// after 90.
//
// The unit was ignored and every answer came back in seconds. What a person
// sees is a six-figure number where they expected a small one - not obviously
// a unit mistake, just a column that has stopped making sense, and any rule
// written against it fires on everything or nothing.
//
// The case also asks the same date in hours and requires that answer to be
// twenty-four times the day one. That holds whatever today's date is, and it
// is what tells "the unit was applied" from "the number happens to look
// plausible".

const NAME_FIELD = "Name";
const DATE_FIELD = "Last heard from";
const DAYS_FIELD = "Days since";
const HOURS_FIELD = "Hours since";

export const runFromnowUnitCase = async (
  bugCase: BugCaseFor<"fromnow-unit">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FromnowUnitCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const daysAgo = Math.floor(
    (Date.now() - Date.parse(config.date)) / (24 * 60 * 60 * 1000),
  );
  if (!Number.isFinite(daysAgo) || daysAgo < config.minimumDaysAgo) {
    throw new Error(
      `the fixture date is ${daysAgo} days ago, and the case needs at least ${config.minimumDaysAgo} - ` +
        "a date too close to today cannot tell days from hours",
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

    const inDays = await createField(tableId, {
      name: DAYS_FIELD,
      type: FieldType.Formula,
      options: { expression: `FROMNOW({${dateFieldId}}, "day")` },
    });
    const inHours = await createField(tableId, {
      name: HOURS_FIELD,
      type: FieldType.Formula,
      options: { expression: `FROMNOW({${dateFieldId}}, "hour")` },
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

    // Fixture verification, outside the checkpoint: the date landed and both
    // columns answered something. A blank answer says nothing about units.
    let fields = await readRow();
    for (
      let attempt = 0;
      attempt < config.settleAttempts &&
      (fields?.[inDays.id] == null || fields?.[inHours.id] == null);
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
    if (fields?.[inDays.id] == null || fields?.[inHours.id] == null) {
      throw new Error(
        `one of the columns answered nothing: ${JSON.stringify({
          days: fields?.[inDays.id],
          hours: fields?.[inHours.id],
        })}`,
      );
    }

    const probe = await bugCheckpoint(
      "how-long-ago-answers-in-the-unit-it-was-asked-for",
      async () => {
        const days = Number(fields?.[inDays.id]);
        const hours = Number(fields?.[inHours.id]);

        if (Math.abs(days - daysAgo) > config.dayTolerance) {
          throw new Error(
            `asked how long ago in days, the column answers ${days} for a date ${daysAgo} days ago - ` +
              (days > daysAgo * 100
                ? "the unit was ignored, so a person reads a six-figure number where they expected a small one and any rule written against it fires on everything"
                : "the number is not the number of days"),
          );
        }
        // Whatever today's date is, hours are twenty-four times days. This is
        // what tells "the unit was applied" from "the number happens to look
        // plausible".
        if (Math.abs(hours - days * 24) > config.hourTolerance) {
          throw new Error(
            `the same date reads ${days} days and ${hours} hours - one of the two units was not applied`,
          );
        }
        return { days, hours };
      },
    );

    return {
      details: {
        tableId,
        date: config.date,
        daysAgo,
        answeredDays: probe.days,
        answeredHours: probe.hours,
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
