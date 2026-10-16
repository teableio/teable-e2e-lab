import { Colors, FieldType, generateWorkflowId } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
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
  ButtonFormulaReferenceCaseConfig,
} from "../types";
import { dropTables } from "./raw-api";

// A button column with a click count on a row, and a formula referring to
// the button -> checkpoint: the formula reads empty, before and after the
// count changes, while the button keeps its count.
//
// A button's cell holds bookkeeping - how many times it was pressed - not a
// value a formula can use. A formula referring to it read the bookkeeping
// itself, as the text {"count": 1}, and that text flowed into whatever the
// formula fed: a label, a concatenation, a filter. The case changes the count
// once more, so a formula that merely missed one update is told apart from
// one that reads empty by rule.

const NAME_FIELD = "Name";
const BUTTON_FIELD = "Run";
const FORMULA_FIELD = "Refers to button";

export const runButtonFormulaReferenceCase = async (
  bugCase: BugCaseFor<"button-formula-reference">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ButtonFormulaReferenceCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  if (config.counts.length < 2 || config.counts.some((count) => count < 1)) {
    throw new Error(
      "the case needs at least two positive counts, so the formula is read across a change",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "row-1" } }],
    });
    tableIds.push(table.id);
    const button = await createField(table.id, {
      name: BUTTON_FIELD,
      type: FieldType.Button,
      options: {
        label: BUTTON_FIELD,
        color: Colors.Teal,
        workflow: {
          id: generateWorkflowId(),
          name: `${config.tableNamePrefix}-workflow`,
          isActive: true,
        },
      },
    });
    const recordId = table.records[0].id;
    await updateRecordByApi(table.id, recordId, button.id, {
      count: config.counts[0],
    });
    const formula = await createField(table.id, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${button.id}}` },
    });

    const probe = await bugCheckpoint(
      "a-formula-over-a-button-reads-empty",
      async () => {
        const listed = await apiGetRecords(table.id, {});
        const routing = assertServedByV2(listed.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const seen: unknown[] = [];
        for (const [index, count] of config.counts.entries()) {
          if (index > 0) {
            await updateRecordByApi(table.id, recordId, button.id, { count });
          }
          const fields = (await getRecord(table.id, recordId)).fields;
          if (JSON.stringify(fields[button.id]) !== JSON.stringify({ count })) {
            throw new Error(
              `the button reads ${JSON.stringify(fields[button.id])} after writing a count of ${count}; ` +
                "the formula cannot be judged against a count that did not land",
            );
          }
          const value = fields[formula.id] ?? null;
          seen.push(value);
          if (value !== null) {
            throw new Error(
              `with the button at ${count} clicks the formula reads ${JSON.stringify(value)}, expected empty`,
            );
          }
        }
        return { routing, seen };
      },
    );

    return { details: { tableId: table.id, formula: probe.seen } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
