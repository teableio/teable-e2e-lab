import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { OverdueFormulaBackfillCaseConfig } from "../types";

// An "is this overdue" column - comparing now against a time worked out from
// when the row was created -> checkpoint: it has an answer.
//
// This is the most-copied formula there is: something is late if the clock has
// passed a deadline derived from when the row appeared. It mixes a time
// comparison with a yes/no answer, and that mixture is what went wrong -
// the comparison was compiled as though the timestamps were text, which the
// database refuses outright.
//
// The refusal happened while the column was being filled in, so the column
// simply never got values. An empty column reads as "nothing is overdue",
// which is the answer people act on: nobody chases what the column says is
// fine.
//
// The row is created before the column, so the value has to be worked out by
// the backfill - the pass that fills a new column in over the rows already
// there, and the pass that was dying.

const NAME_FIELD = "Name";
const OVERDUE_FIELD = "Overdue";

export const runOverdueFormulaBackfillCase = async (
  bugCase: BugCaseFor<"overdue-formula-backfill">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: OverdueFormulaBackfillCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.rowTitles.map((title) => ({
        fields: { [NAME_FIELD]: title },
      })),
    });
    tableId = table.id;

    // The column is added after the rows, so the values come from the pass
    // that fills a new column in over rows that already exist.
    await createField(tableId, {
      name: OVERDUE_FIELD,
      type: FieldType.Formula,
      options: {
        // Late if the clock has passed a deadline worked out from when the
        // row appeared. Written as a bare comparison, so the column holds a
        // yes or a no rather than text: wrapping it in IF() and returning two
        // words is green on both columns (run 32704974280), because it is the
        // yes/no shape that was compiled as though the timestamps were text.
        //
        // The rows were created seconds ago, so every answer is "no" - what
        // matters is that there is an answer at all.
        expression: `NOW() > DATE_ADD(CREATED_TIME(), ${config.hours}, 'hour')`,
      },
    });

    const probe = await bugCheckpoint(
      "an-is-this-overdue-column-has-an-answer",
      async () => {
        const deadline = Date.now() + config.settleTimeoutMs;
        let answers: Record<string, unknown> = {};
        for (;;) {
          const read = await apiGetRecords(tableId, {
            fieldKeyType: FieldKeyType.Name,
            take: config.rowTitles.length,
          });
          answers = Object.fromEntries(
            read.data.records.map(
              (record: { fields: Record<string, unknown> }) => [
                String(record.fields[NAME_FIELD] ?? ""),
                record.fields[OVERDUE_FIELD] ?? null,
              ],
            ),
          );
          const answered = config.rowTitles.filter(
            (title) => answers[title] === false,
          );
          if (answered.length === config.rowTitles.length) {
            return { answers };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }

        const empty = config.rowTitles.filter(
          (title) => answers[title] === null,
        );
        throw new Error(
          `after ${config.settleTimeoutMs}ms the column reads ${JSON.stringify(answers)}, expected every row ` +
            "to say no" +
            (empty.length === config.rowTitles.length
              ? " - the column was never filled in, and an empty overdue column reads as nothing being " +
                "overdue"
              : ""),
        );
      },
    );

    return {
      details: { tableId, answers: probe.answers },
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
