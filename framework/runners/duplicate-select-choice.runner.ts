import { Colors, FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DuplicateSelectChoiceCaseConfig } from "../types";

// A status column whose stored settings list the same choice twice -> open the
// table -> checkpoint: it opens, and the rows read back.
//
// Two choices with one name is not something anyone would set up on purpose.
// It is what a table is left with after an import that ran twice, a merge of
// two option lists, or a migration - and once it is there, nothing in the
// product shows it: the dropdown just looks like it has a repeated entry.
//
// Reading the table then failed outright. Not the column - the table: every
// row, for everyone, because the settings are read before any row can be
// handed out. A base where one table cannot be opened at all, for a reason
// that is invisible in the interface, is the kind of thing that gets reported
// as "teable is down".
//
// The duplicate is written with SQL because the product refuses to create one,
// which is exactly why nobody can clear it from the interface either.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";

export const runDuplicateSelectChoiceCase = async (
  bugCase: BugCaseFor<"duplicate-select-choice">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateSelectChoiceCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [
              { name: config.repeatedChoice, color: Colors.Blue },
              { name: config.otherChoice, color: Colors.Green },
            ],
          },
        },
      ],
      records: config.rowTitles.map((title, index) => ({
        fields: {
          [NAME_FIELD]: title,
          [STATUS_FIELD]:
            index === 0 ? config.repeatedChoice : config.otherChoice,
        },
      })),
    });
    tableId = table.id;
    const statusField = table.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    ) as
      | { id: string; options?: { choices?: { id?: string; name: string }[] } }
      | undefined;
    if (!statusField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the table reads before the
    // settings are damaged.
    const before = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rowTitles.length,
    });
    if (before.data.records.length !== config.rowTitles.length) {
      throw new Error(
        `the table holds ${before.data.records.length} rows, expected ${config.rowTitles.length} - the ` +
          "fixture is not in place",
      );
    }

    // Setup: the same choice name twice, with different ids - the shape an
    // import that ran twice or a merged option list leaves behind. The product
    // refuses to create it, which is why nobody can clear it either.
    const choices = statusField.options?.choices ?? [];
    const repeated = choices.find(
      (choice) => choice.name === config.repeatedChoice,
    );
    if (!repeated) {
      throw new Error(
        `${STATUS_FIELD} does not offer ${config.repeatedChoice}`,
      );
    }
    const damaged = {
      ...(statusField.options ?? {}),
      choices: [
        ...choices,
        { ...repeated, id: `${repeated.id ?? "cho"}dup`.slice(0, 20) },
      ],
    };
    const db = fixtureDb(context.app);
    await db.execute(
      `UPDATE "field" SET "options" = $1 WHERE "id" = $2`,
      JSON.stringify(damaged),
      statusField.id,
    );

    const probe = await bugCheckpoint(
      "a-table-with-a-repeated-choice-still-opens",
      async () => {
        // A read that throws here is the report: the table cannot be opened.
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rowTitles.length,
        });
        const names = read.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD] ?? ""),
          )
          .sort();
        const expected = [...config.rowTitles].sort();
        if (names.join(",") !== expected.join(",")) {
          throw new Error(
            `the table opened but holds ${JSON.stringify(names)}, expected ${JSON.stringify(expected)}`,
          );
        }
        return { names };
      },
    );

    return {
      details: { tableId, rows: probe.names },
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
