import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TextToDateConversionCaseConfig } from "../types";

// A text column holding a few dates that do not exist -> convert it to a date
// column -> checkpoint: the conversion completes, the impossible values come
// out empty and the real one comes out as a date.
//
// Turning a text column into a date column is what happens after an import, or
// after a column that started as free text has been in use for a while. Such a
// column always has a few entries that are not dates: a February 30th, a month
// 13, a typo, a word. That is the normal state of a column somebody typed into.
//
// One of those was enough to stop the whole conversion. The column stays text,
// and the message names a value rather than saying which row it is in, so the
// person is asked to find it themselves in a table of any size.
//
// The good value in the fixture is what makes the assertion two-sided: an
// implementation that emptied the entire column would otherwise look like a
// fix.

const NAME_FIELD = "Name";
const SUBJECT_FIELD = "When";

export const runTextToDateConversionCase = async (
  bugCase: BugCaseFor<"text-to-date-conversion">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TextToDateConversionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const impossible = config.rows.filter((row) => row.becomes === "empty");
  const real = config.rows.filter((row) => row.becomes === "date");
  if (impossible.length < 1 || real.length < 1) {
    throw new Error(
      "the fixture needs at least one value that is not a date and one that is - without the second, a " +
        "conversion that emptied the whole column would look correct",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SUBJECT_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [SUBJECT_FIELD]: row.text },
      })),
    });
    tableId = table.id;
    const subjectFieldId = table.fields.find(
      (field: { name: string }) => field.name === SUBJECT_FIELD,
    )?.id;
    if (!subjectFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the text is stored as
    // typed. If the column had already rejected these values there would be
    // nothing for the conversion to trip over.
    const before = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rows.length,
    });
    const textByName = new Map<string, unknown>(
      before.data.records.map((record: { fields: Record<string, unknown> }) => [
        String(record.fields[NAME_FIELD] ?? ""),
        record.fields[SUBJECT_FIELD],
      ]),
    );
    for (const row of config.rows) {
      if (textByName.get(row.name) !== row.text) {
        throw new Error(
          `row ${row.name} holds ${JSON.stringify(textByName.get(row.name))}, expected ` +
            `${JSON.stringify(row.text)} - the fixture is not in place`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "a-text-column-with-impossible-dates-still-converts",
      async () => {
        // A refused conversion throws here, which is the report.
        await convertField(tableId, subjectFieldId, {
          name: SUBJECT_FIELD,
          type: FieldType.Date,
        });

        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rows.length,
        });
        const routing = assertServedByV2(after.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const valueByName = new Map<string, unknown>(
          after.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              record.fields[SUBJECT_FIELD] ?? null,
            ],
          ),
        );

        const wrong = config.rows.filter((row) => {
          const value = valueByName.get(row.name) ?? null;
          return row.becomes === "empty" ? value !== null : value === null;
        });
        const seen = Object.fromEntries(
          config.rows.map((row) => [
            row.name,
            valueByName.get(row.name) ?? null,
          ]),
        );
        if (wrong.length > 0) {
          const allEmpty = config.rows.every(
            (row) => (valueByName.get(row.name) ?? null) === null,
          );
          throw new Error(
            `after the conversion the column holds ${JSON.stringify(seen)}` +
              (allEmpty
                ? " - the whole column was emptied, the real date included"
                : ` - ${wrong.length} of ${config.rows.length} rows came out on the wrong side`),
          );
        }
        return { routing, seen };
      },
    );

    return {
      details: {
        tableId,
        impossibleValues: impossible.length,
        afterConversion: probe.seen,
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
