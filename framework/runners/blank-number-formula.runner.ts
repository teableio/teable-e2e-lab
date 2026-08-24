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
import type { BlankNumberFormulaCaseConfig } from "../types";

// A formula that asks whether a number is filled in -> checkpoint: the rows
// with nothing in them answer that way.
//
// "Has this been filled in yet" is the most common question a formula asks
// about a number: a chase list of quotes without a price, a count of forms
// still missing an amount, a colour rule that marks the gaps. The rows it is
// asked about are exactly the empty ones.
//
// Comparing a number column against blank did not treat an empty cell as
// blank, so the answer for those rows came out the same as for filled ones.
// Every list built that way is missing precisely the rows it exists to find,
// and it looks like a list with nothing in it - which reads as "nothing to
// chase" rather than "this list is broken".
//
// The fixture holds both kinds of row so the assertion sees a wrong answer
// rather than an empty table.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const VERDICT_FIELD = "Filled in";

export const runBlankNumberFormulaCase = async (
  bugCase: BugCaseFor<"blank-number-formula">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: BlankNumberFormulaCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const empties = config.rows.filter((row) => row.amount === null);
  const filled = config.rows.filter((row) => row.amount !== null);
  if (empties.length < 1 || filled.length < 1) {
    throw new Error(
      "the fixture needs a row with nothing in it and a row with something in it - with only one kind, a " +
        "formula that answers the same for everything looks right",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          ...(row.amount === null ? {} : { [AMOUNT_FIELD]: row.amount }),
        },
      })),
    });
    tableId = table.id;
    const amountFieldId = table.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    if (!amountFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    await createField(tableId, {
      name: VERDICT_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `IF({${amountFieldId}} = BLANK(), "${config.emptyAnswer}", "${config.filledAnswer}")`,
      },
    });

    const probe = await bugCheckpoint(
      "a-formula-asking-whether-a-number-is-filled-in-answers-per-row",
      async () => {
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rows.length,
        });
        const routing = assertServedByV2(read.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const answerByName = Object.fromEntries(
          read.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              record.fields[VERDICT_FIELD] ?? null,
            ],
          ),
        ) as Record<string, unknown>;

        const expected = Object.fromEntries(
          config.rows.map((row) => [
            row.name,
            row.amount === null ? config.emptyAnswer : config.filledAnswer,
          ]),
        );
        const wrong = config.rows.filter(
          (row) => answerByName[row.name] !== expected[row.name],
        );
        if (wrong.length > 0) {
          const allSame =
            new Set(Object.values(answerByName).map((value) => String(value)))
              .size === 1;
          throw new Error(
            `the column reads ${JSON.stringify(answerByName)}, expected ${JSON.stringify(expected)}` +
              (allSame
                ? " - every row answers the same way, so a list of the ones still to fill in comes out empty"
                : ` - ${wrong.length} of ${config.rows.length} rows answer wrongly`),
          );
        }
        return { routing, answers: answerByName };
      },
    );

    return {
      details: { tableId, answers: probe.answers, routing: probe.routing },
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
