import { FieldType } from "@teable/core";
import {
  createTable,
  getRecord,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  FieldConversionValuesCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A column of one type holding a value per row -> convert it to another type
// -> checkpoint: every row holds exactly the value the conversion promises.
//
// A type conversion rewrites every cell in a column at once, with no undo
// that survives the next edit. The failures this guards are all of the same
// shape - the conversion answers 200 and some rows come out as a different
// value from the one the product's own rules give: a 0 that becomes
// unchecked, a tick that becomes five stars, an option containing a comma
// that loses the quotes keeping it one option, a date rendered in the wrong
// zone, a date-only text read at the wrong midnight. Nothing marks the cells
// as changed by the conversion, so the wrong values read as data.
//
// The rows and the values each must become are the case's data; a row whose
// expected value is null must come out empty.

const NAME_FIELD = "Name";
const SOURCE_FIELD = "Source";

const normalise = (value: unknown) => (value === undefined ? null : value);

export const runFieldConversionValuesCase = async (
  bugCase: BugCaseFor<"field-conversion-values">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FieldConversionValuesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  if (config.rows.length === 0) {
    throw new Error("the fixture needs at least one row");
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: SOURCE_FIELD,
          type: config.source.type,
          ...(config.source.options ? { options: config.source.options } : {}),
        },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          ...(row.before === null ? {} : { [SOURCE_FIELD]: row.before }),
        },
      })),
    });
    tableIds.push(table.id);
    const sourceId = table.fields.find(
      (field: { name: string }) => field.name === SOURCE_FIELD,
    )?.id;
    if (!sourceId) {
      throw new Error(`table ${table.id} has no ${SOURCE_FIELD} column`);
    }

    // The rows have to hold what the case says they hold before converting,
    // or a wrong answer afterwards proves nothing about the conversion.
    const seeded = await getRecords(table.id);
    const recordIdByName = new Map<string, string>();
    for (const record of seeded.records) {
      recordIdByName.set(String(record.fields[NAME_FIELD]), record.id);
    }
    for (const row of config.rows) {
      const recordId = recordIdByName.get(row.name);
      const stored = recordId
        ? normalise((await getRecord(table.id, recordId)).fields[sourceId])
        : undefined;
      if (JSON.stringify(stored) !== JSON.stringify(row.before)) {
        throw new Error(
          `row ${row.name} holds ${JSON.stringify(stored)} before the conversion, expected ${JSON.stringify(row.before)}`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "every-row-holds-the-value-the-conversion-promises",
      async () => {
        const converted = await rawRequest(
          "PUT",
          `/table/${table.id}/field/${sourceId}/convert`,
          {
            type: config.target.type,
            ...(config.target.options
              ? { options: config.target.options }
              : {}),
          },
        );
        if (!isSuccess(converted)) {
          throw new Error(
            `converting ${config.source.type} to ${config.target.type} answered ${describeResponse(converted)}`,
          );
        }
        const routing = assertServedByV2(converted.headers, {
          operation: "PUT /table/{tableId}/field/{fieldId}/convert",
          feature: "convertField",
        });
        const after: Record<string, unknown> = {};
        const wrong: string[] = [];
        for (const row of config.rows) {
          const recordId = recordIdByName.get(row.name) as string;
          const value = normalise(
            (await getRecord(table.id, recordId)).fields[sourceId],
          );
          after[row.name] = value;
          if (JSON.stringify(value) !== JSON.stringify(row.after)) {
            wrong.push(
              `${JSON.stringify(row.before)} became ${JSON.stringify(value)}, expected ${JSON.stringify(row.after)}`,
            );
          }
        }
        if (wrong.length > 0) {
          throw new Error(
            `${wrong.length} of ${config.rows.length} rows converted wrong from ${config.source.type} to ` +
              `${config.target.type}: ${wrong.join("; ")}`,
          );
        }
        return { routing, after };
      },
    );

    return { details: { tableId: table.id, after: probe.after } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
