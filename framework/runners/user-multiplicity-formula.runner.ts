import { FieldKeyType, FieldType } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  convertField,
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserMultiplicityFormulaCaseConfig } from "../types";

// A formula that reads a member column -> switch that column from one person
// to several -> checkpoint: the formula follows.
//
// Widening a member column is a normal thing to do part way through: a task
// that had one owner now has two, an approval that needed one signature now
// needs a pair. The column itself changes shape - it starts holding a list -
// and anything reading it has to change shape with it.
//
// The formula did not. It went on producing what it produced for one person,
// so a column that says "two owners" and a column derived from it that says
// one owner sit side by side, and whatever consumes the second - an export, a
// filter, a message built from it - keeps working with the wrong shape and
// never says so.
//
// The row is created before the change, because rows written after it are
// written into the new shape and would not show the difference.

const NAME_FIELD = "Name";
const USER_FIELD = "Owner";
const FORMULA_FIELD = "Owner name";

export const runUserMultiplicityFormulaCase = async (
  bugCase: BugCaseFor<"user-multiplicity-formula">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserMultiplicityFormulaCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: USER_FIELD,
          type: FieldType.User,
          options: { isMultiple: false, shouldNotify: false },
        },
      ],
      records: [],
    });
    tableId = table.id;
    const userField = table.fields.find(
      (field: { name: string }) => field.name === USER_FIELD,
    );
    if (!userField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const formulaField = await createField(tableId, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${userField.id}}` },
    });

    // The row is written while the column still holds one person. A row
    // written after the change is written into the new shape and would not
    // show the difference.
    await apiCreateRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            // A user cell needs the name as well as the id - run 32690596776
            // answered "expected string, received undefined at title".
            [userField.id]: {
              id: globalThis.testConfig.userId,
              title: globalThis.testConfig.userName,
            },
          },
        },
      ],
    });

    const readFormula = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return read.data.records[0]?.fields[formulaField.id] ?? null;
    };

    // Fixture verification, outside the checkpoint: the formula produces
    // something for one person. If it produced nothing, the shape after the
    // change would prove nothing either.
    const before = await readFormula();
    if (before === null || Array.isArray(before)) {
      throw new Error(
        `while the column holds one person the formula reads ${JSON.stringify(before)}, expected a single ` +
          "value - the fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-formula-follows-a-member-column-that-becomes-multiple",
      async () => {
        await convertField(tableId, userField.id, {
          name: USER_FIELD,
          type: FieldType.User,
          options: { isMultiple: true, shouldNotify: false },
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let after: unknown = null;
        for (;;) {
          after = await readFormula();
          if (
            Array.isArray(after) &&
            after.length === 1 &&
            after[0] === before
          ) {
            return { before, after };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }

        throw new Error(
          `after widening the column to several people the formula reads ${JSON.stringify(after)}, expected ` +
            `${JSON.stringify([before])}` +
            (after === before
              ? " - it is still producing what it produced for one person, so the column and the column " +
                "derived from it disagree about their shape"
              : ""),
        );
      },
    );

    return {
      details: {
        tableId,
        formulaBefore: probe.before,
        formulaAfter: probe.after,
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
