import { FieldKeyType, FieldType } from "@teable/core";
import { createRecords as apiCreateRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormulaOverSystemColumnsCaseConfig } from "../types";

// Columns worked out from what the product knows about a row - when it was
// added, who added it, its number in the table -> add a row -> checkpoint: the
// answer comes back with the row.
//
// These are the columns a table uses to keep track of itself: how long this
// has been open, who entered it, what its reference number is. The product
// fills the underlying values in as the row is created, so a column that reads
// them has everything it needs at that moment.
//
// They came back empty. The row is added, the person looks at it, and the
// columns that should say "0 days" and their own name say nothing - the values
// appear later, or on the next reload, which is exactly when nobody is looking
// any more. The row that was just typed is the one row where these columns are
// blank.
//
// The answer to the write is what the case reads. That is the row the person
// is looking at, and reading it again afterwards would ask a different
// question.

const NAME_FIELD = "Name";
const CREATED_AT = "Added";
const CREATED_BY = "Added by";
const NUMBERED = "Reference";
const DAYS_OPEN = "Days open";
const WHO_ADDED = "Who added it";
const NUMBER_SHOWN = "Reference, shown";

export const runFormulaOverSystemColumnsCase = async (
  bugCase: BugCaseFor<"formula-over-system-columns">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormulaOverSystemColumnsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableId = table.id;

    // The three things a table knows about a row without being told.
    const createdAt = await createField(tableId, {
      name: CREATED_AT,
      type: FieldType.CreatedTime,
    });
    const createdBy = await createField(tableId, {
      name: CREATED_BY,
      type: FieldType.CreatedBy,
    });
    const numbered = await createField(tableId, {
      name: NUMBERED,
      type: FieldType.AutoNumber,
    });

    // And the columns a person writes over them.
    const daysOpen = await createField(tableId, {
      name: DAYS_OPEN,
      type: FieldType.Formula,
      options: {
        expression: `DATETIME_DIFF(NOW(), {${createdAt.id}}, "day")`,
      },
    });
    const whoAdded = await createField(tableId, {
      name: WHO_ADDED,
      type: FieldType.Formula,
      options: { expression: `{${createdBy.id}}` },
    });
    const numberShown = await createField(tableId, {
      name: NUMBER_SHOWN,
      type: FieldType.Formula,
      options: { expression: `{${numbered.id}}` },
    });

    // Fixture verification, outside the checkpoint: the three columns the
    // formulas read exist and are the kinds they are meant to be. A formula
    // over a column of the wrong kind would be blank for a reason that has
    // nothing to do with this.
    const kinds = {
      [CREATED_AT]: createdAt.type,
      [CREATED_BY]: createdBy.type,
      [NUMBERED]: numbered.type,
    };
    if (
      createdAt.type !== FieldType.CreatedTime ||
      createdBy.type !== FieldType.CreatedBy ||
      numbered.type !== FieldType.AutoNumber
    ) {
      throw new Error(
        `the columns the formulas read are ${JSON.stringify(kinds)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "columns-worked-out-from-a-new-row-answer-with-it",
      async () => {
        const created = await apiCreateRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          records: [{ fields: { [table.fields[0].id]: config.rowTitle } }],
        });
        const row = created.data.records[0];
        if (!row) {
          throw new Error("adding a row returned no row");
        }

        const answers = {
          [DAYS_OPEN]: row.fields[daysOpen.id],
          [WHO_ADDED]: row.fields[whoAdded.id],
          [NUMBER_SHOWN]: row.fields[numberShown.id],
        };
        const blank = Object.entries(answers).filter(
          ([, value]) => value == null || value === "",
        );
        if (blank.length > 0) {
          throw new Error(
            `${blank.length} of 3 worked-out columns came back empty on the row that was just added: ${JSON.stringify(answers)} - ` +
              "the values they read are filled in as the row is created, and the row just typed is the one row where these columns say nothing",
          );
        }
        if (Number(answers[DAYS_OPEN]) !== 0) {
          throw new Error(
            `the row reads ${JSON.stringify(answers[DAYS_OPEN])} days open, expected 0 - it was added just now`,
          );
        }
        if (Number(answers[NUMBER_SHOWN]) < 1) {
          throw new Error(
            `the row's reference number reads ${JSON.stringify(answers[NUMBER_SHOWN])}, expected a number of its own`,
          );
        }
        return { answers };
      },
    );

    return {
      details: {
        tableId,
        answers: probe.answers,
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
