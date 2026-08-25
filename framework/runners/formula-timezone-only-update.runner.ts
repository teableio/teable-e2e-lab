import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
} from "@teable/core";
import {
  convertField as apiConvertField,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormulaTimezoneOnlyUpdateCaseConfig } from "../types";

// A worked-out date column -> change only the time zone it is shown in ->
// checkpoint: the rule that works it out is still the rule the person wrote.
//
// The time zone a date is displayed in is a display setting. Changing it says
// nothing about how the date is arrived at, and a person changing it is not
// editing their formula - they are making the column readable for a team in
// another country.
//
// Their formula was replaced. What the column computed afterwards was the time
// the row was last touched: a plausible-looking date, in every row, quietly
// wrong, and the rule they wrote is not recoverable from anywhere on screen.
// The only way to notice is to open the column's settings again and read what
// is there now.
//
// The observation is the rule the product reports for the column afterwards,
// not the values: values that look like dates are exactly what makes this hard
// to see.

const NAME_FIELD = "Name";
const DATE_FIELD = "Starts";
const COMPUTED_FIELD = "Starts, worked out";

export const runFormulaTimezoneOnlyUpdateCase = async (
  bugCase: BugCaseFor<"formula-timezone-only-update">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormulaTimezoneOnlyUpdateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.newTimeZone === config.timeZone) {
    throw new Error(
      "the new time zone has to differ from the old one, or nothing is being changed",
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
              time: TimeFormatting.Hour24,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: [
        { fields: { [NAME_FIELD]: "a-row", [DATE_FIELD]: config.startsAt } },
      ],
    });
    tableId = table.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    if (!dateFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const expression = `DATETIME_FORMAT({${dateFieldId}}, 'YYYY-MM-DD HH:mm:ss')`;
    const computed = await createField(tableId, {
      name: COMPUTED_FIELD,
      type: FieldType.Formula,
      options: { expression, timeZone: config.timeZone },
    });

    const readComputed = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 5,
      });
      return read.data.records[0]?.fields[computed.id];
    };

    // Fixture verification, outside the checkpoint: the column carries the
    // rule as written and shows the date in the time zone it was made with. A
    // rule that never landed would have the checkpoint comparing a wrong thing
    // against a wrong thing.
    if (computed.options?.expression !== expression) {
      throw new Error(
        `the column was made with ${JSON.stringify(computed.options?.expression)}, expected ${JSON.stringify(expression)}`,
      );
    }
    let shownBefore: unknown;
    for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
      shownBefore = await readComputed();
      if (shownBefore != null) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, config.settleIntervalMs),
      );
    }
    if (shownBefore !== config.shownBefore) {
      throw new Error(
        `the column shows ${JSON.stringify(shownBefore)} before the change, expected ${JSON.stringify(config.shownBefore)}`,
      );
    }

    const probe = await bugCheckpoint(
      "changing-only-the-time-zone-keeps-the-rule",
      async () => {
        // Only the time zone differs from what the column already carries -
        // the same rule, shown somewhere else.
        await apiConvertField(tableId, computed.id, {
          type: FieldType.Formula,
          options: { expression, timeZone: config.newTimeZone },
        });

        const after = await getField(tableId, computed.id);
        if (after.options?.expression !== expression) {
          throw new Error(
            `the column now works itself out as ${JSON.stringify(after.options?.expression)}, the person wrote ` +
              `${JSON.stringify(expression)} - changing how a date is shown says nothing about how it is arrived at, ` +
              "and what it computes now looks like a date on every row",
          );
        }

        let shownAfter: unknown;
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          shownAfter = await readComputed();
          if (shownAfter === config.shownAfter) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }
        if (shownAfter !== config.shownAfter) {
          throw new Error(
            `the column shows ${JSON.stringify(shownAfter)} after the change, expected ${JSON.stringify(config.shownAfter)} - ` +
              "the same instant read in the other time zone",
          );
        }
        return {
          expression: after.options?.expression,
          shownAfter,
        };
      },
    );

    return {
      details: {
        tableId,
        fieldId: computed.id,
        expressionAfter: probe.expression,
        shownAfter: probe.shownAfter,
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
