import {
  Colors,
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  RatingIcon,
  TimeFormatting,
} from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  UPDATE_RECORD,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ValueNormalizationCaseConfig } from "../types";

// A value typed into a cell that the field cannot hold as written -> write it
// with typecast on, the way an import or a paste does -> checkpoint: the cell
// holds what v1 would have stored.
//
// Typecast is what makes a spreadsheet import work: the value arrives as text
// and the field decides what to do with it. What it decides is not cosmetic -
// it is what filters, formulas and every later read see - and v2's answers had
// drifted from v1's in ways nobody notices until the numbers disagree:
//
//   invalidDate: a date that does not exist was rolled forward to one that
//     does. February 30th became March 2nd, silently, and the row then carried
//     a date nobody entered.
//   ratingFraction: a fractional rating was stored as written. A rating field
//     is whole stars by definition, so 2.7 broke filters and comparisons that
//     assume the domain the field advertises.
//   emptyValue: clearing a cell stored an empty string where v1 stored null.
//     The two are the same to look at and different to an "is empty" filter.
//
// Everything here is public API: these are the values a person types, pastes
// or imports.

const NAME_FIELD = "Name";
const ROW_TITLE = "the-row";

const FIELD_NAME = {
  invalidDate: "When",
  ratingFraction: "Score",
  emptyValue: "Note",
} as const;

export const runValueNormalizationCase = async (
  bugCase: BugCaseFor<"value-normalization">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ValueNormalizationCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const subjectName = FIELD_NAME[config.variant];
  const subjectField =
    config.variant === "invalidDate"
      ? {
          name: subjectName,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: "UTC",
            },
          },
        }
      : config.variant === "ratingFraction"
        ? {
            name: subjectName,
            type: FieldType.Rating,
            options: {
              max: config.ratingMax,
              icon: RatingIcon.Star,
              color: Colors.YellowBright,
            },
          }
        : { name: subjectName, type: FieldType.SingleLineText };

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        subjectField,
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: ROW_TITLE,
            ...(config.variant === "emptyValue"
              ? { [subjectName]: config.seedValue }
              : {}),
          },
        },
      ],
    });
    tableId = table.id;
    const recordId = table.records[0]?.id;
    const subjectFieldId = table.fields.find(
      (field: { name: string }) => field.name === subjectName,
    )?.id;
    if (!recordId || !subjectFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readCell = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        headers: response.headers,
        value: response.data.records[0]?.fields[subjectFieldId],
      };
    };

    // Fixture verification, outside the checkpoint: for the empty-value shape
    // the cell has to hold something first, or "clearing it stored the wrong
    // empty" would be about a cell that was never filled.
    const before = await readCell();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (config.variant === "emptyValue" && !before.value) {
      throw new Error(
        `the cell is already empty before the clear (${JSON.stringify(before.value)}) - the fixture is not in place`,
      );
    }

    // Typecast on: this is the write an import, a paste or a CSV row makes,
    // and it is the path whose answers drifted.
    const write = await axios.patch(
      urlBuilder(UPDATE_RECORD, { tableId, recordId }),
      {
        fieldKeyType: FieldKeyType.Id,
        typecast: true,
        record: { fields: { [subjectFieldId]: config.writtenValue } },
      },
      { validateStatus: () => true },
    );
    const writeStatus = write.status;
    const writeBody =
      typeof write.data === "string"
        ? write.data
        : JSON.stringify(write.data ?? "");

    const probe = await bugCheckpoint(
      "typecast-stores-what-v1-stored",
      async () => {
        if (writeStatus < 200 || writeStatus >= 300) {
          throw new Error(
            `writing ${JSON.stringify(config.writtenValue)} with typecast answered ${writeStatus}: ${writeBody}`,
          );
        }
        const after = await readCell();
        const stored = after.value ?? null;
        const expected = config.expectedStored ?? null;
        if (JSON.stringify(stored) !== JSON.stringify(expected)) {
          return Promise.reject(
            new Error(
              `writing ${JSON.stringify(config.writtenValue)} with typecast stored ${JSON.stringify(stored)}, ` +
                `expected ${JSON.stringify(expected)}`,
            ),
          );
        }
        return { stored };
      },
    );

    return {
      details: {
        tableId,
        variant: config.variant,
        routing,
        written: config.writtenValue,
        writeStatus,
        stored: probe.stored,
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
