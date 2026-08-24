import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
} from "@teable/core";
import {
  axios,
  createRecords as apiCreateRecords,
  getFields as apiGetFields,
  CREATE_FIELD,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TimezoneAliasCaseConfig } from "../types";

// A date column in a time zone named the way older systems name it ->
// checkpoint: the column is created and keeps that name.
//
// Time zones have more than one name each. "Asia/Calcutta" and "Asia/Kolkata"
// are the same zone; so are "America/Buenos_Aires" and
// "America/Argentina/Buenos_Aires". Which one arrives is not the user's
// choice - it is whatever their browser, their spreadsheet or the system
// exporting to them happens to send, and the older names are still what many
// of them send.
//
// The accepted list held only the current names, so those requests were
// refused outright. What the person sees is a date column they cannot create,
// with a message about the zone they never picked by hand.
//
// The column has to keep the name it was given, too: quietly rewriting it to
// the current spelling would send a different zone back to whatever is reading
// the field, which is a subtler version of the same problem.

const NAME_FIELD = "Name";
const DATE_FIELD = "When";

export const runTimezoneAliasCase = async (
  bugCase: BugCaseFor<"timezone-alias">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TimezoneAliasCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableId = table.id;

    const probe = await bugCheckpoint(
      "a-date-column-can-be-created-in-an-aliased-time-zone",
      async () => {
        // Raw axios with the status open: the refusal is the report, and the
        // generated client throws the message away with it.
        const response = await axios.post(
          urlBuilder(CREATE_FIELD, { tableId }),
          {
            name: DATE_FIELD,
            type: FieldType.Date,
            options: {
              formatting: {
                date: DateFormattingPreset.ISO,
                time: TimeFormatting.None,
                timeZone: config.aliasZone,
              },
            },
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `creating a date column in ${config.aliasZone} answered ${response.status}: ` +
              `${JSON.stringify(response.data)} - that name is one many systems send, and the person ` +
              "filling the form never chose it by hand",
          );
        }
        const fieldId = (response.data as { id?: string })?.id;
        if (!fieldId) {
          throw new Error(
            `creating the column answered ${response.status} but returned no field`,
          );
        }

        // The name it was given, kept. Rewriting it to the current spelling
        // would send a different zone back to whatever reads the field.
        const fields = await apiGetFields(tableId, {
          fieldKeyType: FieldKeyType.Id,
        });
        const stored = fields.data.find(
          (field: { id: string }) => field.id === fieldId,
        ) as { options?: { formatting?: { timeZone?: string } } } | undefined;
        const zone = stored?.options?.formatting?.timeZone;
        if (zone !== config.aliasZone) {
          throw new Error(
            `the column was created but its zone reads ${JSON.stringify(zone)}, expected ` +
              `${JSON.stringify(config.aliasZone)}`,
          );
        }

        // And it works: a row written into it comes back.
        const written = await apiCreateRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          records: [{ fields: { [fieldId]: config.value } }],
        });
        const cell = written.data.records[0]?.fields[fieldId];
        if (!cell) {
          throw new Error(
            `a date written into the new column came back as ${JSON.stringify(cell)}`,
          );
        }
        return { status: response.status, zone, cell };
      },
    );

    return {
      details: { tableId, zone: probe.zone, cell: probe.cell },
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
