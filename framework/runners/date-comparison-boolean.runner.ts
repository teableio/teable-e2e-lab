import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DateComparisonBooleanCaseConfig } from "../types";

// A formula that combines two date comparisons -> checkpoint: a row the
// comparison excludes reads as false.
//
// "Is it overdue", "is it still inside the window", "did it happen after we
// shipped" - a date compared against another date, joined with AND or OR to
// another condition. That is the ordinary shape of a status column, and what
// filters, colour rules and rollups downstream are built on.
//
// The comparison was not recognised as producing a yes or no, so anything with
// a date in it was read as yes. Every row with a date came out on the same
// side, and the column that was supposed to divide the table stopped dividing
// it - while still looking like an answer.
//
// The fixture holds one row on each side, so a column stuck on yes and a
// column that is simply right are told apart in the same read.

const NAME_FIELD = "Name";
const DATE_FIELD = "When";
const VERDICT_FIELD = "Verdict";

export const runDateComparisonBooleanCase = async (
  bugCase: BugCaseFor<"date-comparison-boolean">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DateComparisonBooleanCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const insideRows = config.rows.filter((row) => row.expected);
  const outsideRows = config.rows.filter((row) => !row.expected);
  if (insideRows.length < 1 || outsideRows.length < 1) {
    throw new Error(
      "the fixture needs a row the comparison includes and a row it excludes - with only one side, a " +
        "column stuck on yes and a correct column look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: DATE_FIELD, type: FieldType.Date },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [DATE_FIELD]: row.date },
      })),
    });
    tableId = table.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    if (!dateFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // The two date comparisons joined by the combinator, in the shape a status
    // column has: neither operand is a constant true, so the comparison is
    // what decides the answer.
    const expression =
      `${config.combinator}(` +
      `${config.left.fn}({${dateFieldId}}, '${config.left.date}'), ` +
      `${config.right.fn}({${dateFieldId}}, '${config.right.date}'))`;
    await createField(tableId, {
      name: VERDICT_FIELD,
      type: FieldType.Formula,
      options: { expression },
    });

    const probe = await bugCheckpoint(
      "a-date-comparison-inside-and-or-still-decides",
      async () => {
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rows.length,
        });
        const routing = assertServedByV2(read.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });

        const verdictByName = new Map<string, unknown>(
          read.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              record.fields[VERDICT_FIELD],
            ],
          ),
        );
        if (verdictByName.size !== config.rows.length) {
          throw new Error(
            `read ${verdictByName.size} rows, expected ${config.rows.length} - the fixture is not in place`,
          );
        }

        // A boolean formula reads as true or as nothing, so "yes" is the
        // value being exactly true and "no" is anything else. Both sides are
        // reported either way, because a column stuck on no would be just as
        // wrong and this is the read that would show it.
        const wrong = config.rows.filter(
          (row) => (verdictByName.get(row.name) === true) !== row.expected,
        );
        const seen = Object.fromEntries(
          config.rows.map((row) => [
            row.name,
            verdictByName.get(row.name) ?? null,
          ]),
        );
        if (wrong.length > 0) {
          const allYes = config.rows.every(
            (row) => verdictByName.get(row.name) === true,
          );
          throw new Error(
            `${expression} answers ${JSON.stringify(seen)}, expected ` +
              `${JSON.stringify(
                Object.fromEntries(
                  config.rows.map((row) => [row.name, row.expected]),
                ),
              )}` +
              (allYes
                ? " - every row with a date came out yes, so the column no longer divides the table"
                : ` - ${wrong.length} of ${config.rows.length} rows are on the wrong side`),
          );
        }
        return { routing, seen };
      },
    );

    return {
      details: {
        tableId,
        expression,
        verdicts: probe.seen,
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
