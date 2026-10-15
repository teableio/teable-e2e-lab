import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
} from "@teable/core";
import { getRecord as apiGetRecord } from "@teable/openapi";
import {
  createTable,
  getRecord,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  CreatedTimeConversionCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A created-time column with a row in it -> convert the column to plain text,
// and (in a second table) to an ordinary date -> checkpoint: every row keeps
// the moment it was created, as the text the column was showing or as the
// same date.
//
// Turning "when was this added" into an ordinary column is how people pin a
// date before reorganising a table, or make it editable to correct an import.
// The conversion answered 200 and left the column empty: every row's creation
// date was gone, with nothing to undo because nothing had failed.
//
// The text target is checked against the string the column showed before the
// conversion, worked out locally from the stored instant and the column's own
// time zone - a zone far from UTC, so a conversion that ignored it reads a
// different hour.

const NAME_FIELD = "Name";
const CREATED_FIELD = "Created";

const formatInZone = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

export const runCreatedTimeConversionCase = async (
  bugCase: BugCaseFor<"created-time-conversion">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CreatedTimeConversionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const fixtures: {
      target: "singleLineText" | "date";
      tableId: string;
      fieldId: string;
      recordId: string;
      original: string;
    }[] = [];
    for (const target of config.targets) {
      const table = await createTable(baseId, {
        name: `${config.tableNamePrefix}-${target}-${context.runId}`,
        fields: [
          { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
          {
            name: CREATED_FIELD,
            type: FieldType.CreatedTime,
            options: {
              formatting: {
                date: DateFormattingPreset.ISO,
                time: TimeFormatting.Hour24,
                timeZone: config.timeZone,
              },
            },
          },
        ],
        records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
      });
      tableIds.push(table.id);
      const fieldId = table.fields.find(
        (field: { name: string }) => field.name === CREATED_FIELD,
      )?.id;
      const recordId = table.records[0]?.id;
      if (!fieldId || !recordId) {
        throw new Error(`table ${table.id} is not in place`);
      }
      const before = await apiGetRecord(table.id, recordId, {
        fieldKeyType: FieldKeyType.Id,
      });
      assertServedByV2(before.headers, {
        operation: "GET /table/{tableId}/record/{recordId}",
        feature: "getRecords",
      });
      const original = before.data.fields[fieldId];
      if (typeof original !== "string" || !original) {
        throw new Error(
          `the created time reads ${JSON.stringify(original)} before any conversion`,
        );
      }
      fixtures.push({
        target,
        tableId: table.id,
        fieldId,
        recordId,
        original,
      });
    }

    const probe = await bugCheckpoint(
      "a-converted-created-time-keeps-every-rows-moment",
      async () => {
        const seen: Record<string, unknown> = {};
        for (const fixture of fixtures) {
          const converted = await rawRequest(
            "PUT",
            `/table/${fixture.tableId}/field/${fixture.fieldId}/convert`,
            { type: fixture.target },
          );
          if (!isSuccess(converted)) {
            throw new Error(
              `converting the created time to ${fixture.target} answered ${describeResponse(converted)}`,
            );
          }
          assertServedByV2(converted.headers, {
            operation: "PUT /table/{tableId}/field/{fieldId}/convert",
            feature: "convertField",
          });
          const after = (await getRecord(fixture.tableId, fixture.recordId))
            .fields[fixture.fieldId];
          const expected =
            fixture.target === "date"
              ? fixture.original
              : formatInZone(fixture.original, config.timeZone);
          if (after !== expected) {
            throw new Error(
              `after converting to ${fixture.target} the row reads ${JSON.stringify(after)}, expected ${JSON.stringify(expected)}` +
                (after == null ? " - the creation date is gone" : ""),
            );
          }
          if (fixture.target === "date") {
            // An ordinary date column takes a typed value; a column still
            // behaving as created time would ignore it.
            await updateRecordByApi(
              fixture.tableId,
              fixture.recordId,
              fixture.fieldId,
              config.writtenDate,
            );
            const written = (await getRecord(fixture.tableId, fixture.recordId))
              .fields[fixture.fieldId];
            if (written !== config.writtenDate) {
              throw new Error(
                `the converted date column reads ${JSON.stringify(written)} after writing ${config.writtenDate}`,
              );
            }
          }
          seen[fixture.target] = after;
        }
        return seen;
      },
    );

    return { details: { values: probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
