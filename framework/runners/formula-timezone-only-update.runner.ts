import { DateFormattingPreset, FieldType, TimeFormatting } from "@teable/core";
import { axios, UPDATE_FIELD, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
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

    const expression = `{${dateFieldId}}`;
    const computed = await createField(tableId, {
      name: COMPUTED_FIELD,
      type: FieldType.Formula,
      options: {
        expression,
        formatting: {
          date: DateFormattingPreset.ISO,
          time: TimeFormatting.Hour24,
          timeZone: config.timeZone,
        },
      },
    });

    // Fixture verification, outside the checkpoint: the column carries the
    // rule as written. A rule that never landed would make the checkpoint
    // compare a wrong thing against a wrong thing.
    if (computed.options?.expression !== expression) {
      throw new Error(
        `the column was made with ${JSON.stringify(computed.options?.expression)}, expected ${JSON.stringify(expression)}`,
      );
    }

    const probe = await bugCheckpoint(
      "changing-only-the-time-zone-keeps-the-rule",
      async () => {
        // Only the display setting. Nothing else is sent, and nothing else
        // should change - which is what a partial update means.
        const response = await axios.patch(
          urlBuilder(UPDATE_FIELD, { tableId, fieldId: computed.id }),
          {
            options: {
              formatting: {
                date: DateFormattingPreset.ISO,
                time: TimeFormatting.Hour24,
                timeZone: config.newTimeZone,
              },
            },
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `changing the time zone answered ${response.status}: ${JSON.stringify(response.data)?.slice(0, 300)}`,
          );
        }

        const after = await getField(tableId, computed.id);
        if (after.options?.expression !== expression) {
          throw new Error(
            `the column now works itself out as ${JSON.stringify(after.options?.expression)}, the person wrote ` +
              `${JSON.stringify(expression)} - changing how a date is shown says nothing about how it is arrived at, ` +
              "and what it computes now looks like a date on every row",
          );
        }
        if (after.options?.formatting?.timeZone !== config.newTimeZone) {
          throw new Error(
            `the column is still shown in ${JSON.stringify(after.options?.formatting?.timeZone)}, expected ` +
              `${JSON.stringify(config.newTimeZone)} - the change did not take`,
          );
        }
        return {
          expression: after.options?.expression,
          timeZone: after.options?.formatting?.timeZone,
          routing: pickRoutingHeaders(response.headers),
        };
      },
    );

    return {
      details: {
        tableId,
        fieldId: computed.id,
        expressionAfter: probe.expression,
        timeZoneAfter: probe.timeZone,
        routing: probe.routing,
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
