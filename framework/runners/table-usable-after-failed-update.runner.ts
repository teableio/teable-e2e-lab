import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  CONVERT_FIELD,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TableUsableAfterFailedUpdateCaseConfig } from "../types";

// A change to a column that cannot be applied -> checkpoint: the table still
// works.
//
// Some column changes are refused by the data already in the table. Turning on
// "no duplicates" for a column that has duplicates is the everyday example:
// the request has to fail, and there is nothing wrong with that - the person
// clears the duplicates and tries again.
//
// What they could not do is try again. The failed attempt left the table marked
// as not finished being set up, and everything after that was refused: reading
// it, adding a row, changing the column back. One rejected settings change and
// the table is gone until someone with database access lifts the mark.
//
// So the failing request is not the subject - it fails on both sides of the
// fix, as it should. The subject is everything after it.

const NAME_FIELD = "Name";
const CODE_FIELD = "Code";

export const runTableUsableAfterFailedUpdateCase = async (
  bugCase: BugCaseFor<"table-usable-after-failed-update">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TableUsableAfterFailedUpdateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (!config.values.some((value) => value === "")) {
    throw new Error(
      "the column has to start with an empty cell, or the change would be applied and there would be no " +
        "failure to recover from",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CODE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.values.map((value, index) => ({
        fields: { [NAME_FIELD]: `row-${index + 1}`, [CODE_FIELD]: value },
      })),
    });
    tableId = table.id;
    const codeFieldId = table.fields.find(
      (field: { name: string }) => field.name === CODE_FIELD,
    )?.id;
    if (!codeFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const probe = await bugCheckpoint(
      "requiring-a-value-is-refused-while-a-cell-is-empty",
      async () => {
        // Turning on "must be filled in" over a column that already has an
        // empty cell. It has to be refused: accepting it leaves the table
        // holding a row the rule forbids, so the rule is broken from the
        // moment it is switched on and nothing will ever say so.
        const refused = await axios.put(
          urlBuilder(CONVERT_FIELD, { tableId, fieldId: codeFieldId }),
          { name: CODE_FIELD, type: FieldType.SingleLineText, notNull: true },
          { validateStatus: () => true },
        );
        if (refused.status >= 200 && refused.status < 300) {
          throw new Error(
            `requiring a value in a column that has an empty cell answered ${refused.status} - the rule is ` +
              "on and the empty row is still there, so the table holds a row its own rule forbids",
          );
        }

        // And everything the person would do next. A refused change used to
        // leave the table marked as not finished being set up, so reading it,
        // adding a row and changing the column again were all refused too.
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.values.length,
        });
        if (read.data.records.length !== config.values.length) {
          throw new Error(
            `after the refused change the table reads ${read.data.records.length} rows, expected ` +
              `${config.values.length}`,
          );
        }

        const added = await apiCreateRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          records: [
            {
              fields: {
                [NAME_FIELD]: config.rowAddedAfter,
                [CODE_FIELD]: config.valueAddedAfter,
              },
            },
          ],
        });
        if (
          added.data.records[0]?.fields[NAME_FIELD] !== config.rowAddedAfter
        ) {
          throw new Error(
            "adding a row after the refused change did not store what was sent",
          );
        }

        // And the same settings change again, now that it could succeed: the
        // person's actual next step is to fix the data and retry.
        const retried = await axios.put(
          urlBuilder(CONVERT_FIELD, { tableId, fieldId: codeFieldId }),
          { name: config.renamedTo, type: FieldType.SingleLineText },
          { validateStatus: () => true },
        );
        if (retried.status < 200 || retried.status >= 300) {
          throw new Error(
            `changing the column again after the refused change answered ${retried.status}: ` +
              `${JSON.stringify(retried.data)} - the table is stuck behind the earlier failure`,
          );
        }
        return { refusedStatus: refused.status, retriedStatus: retried.status };
      },
    );

    return {
      details: {
        tableId,
        refusedStatus: probe.refusedStatus,
        retriedStatus: probe.retriedStatus,
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
