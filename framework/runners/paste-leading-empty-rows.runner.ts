import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  PASTE_BY_ID_URL,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { PasteLeadingEmptyRowsCaseConfig } from "../types";

// Paste a block whose first line is blank -> checkpoint: the row it lands on
// is cleared, and every later value lands where it was addressed.
//
// A blank first line is not a mistake. It is what a person copies when the top
// row of their selection has nothing in that column: a spreadsheet block with
// an empty first cell, or a column of values where the first entry has not
// been decided yet. The blank means "empty this one", the same as every other
// value in the block means "put this here".
//
// Dropping it shifts everything up by a row. Nothing about that is visible:
// the paste answers with the right number of rows touched, the values are the
// ones the person copied, and each of them is one row from where it belongs.
// The row that should have been emptied keeps its old value, which is the part
// that survives the longest.
//
// The values are made distinct on purpose so a shift of one row cannot be
// mistaken for anything else.

const NAME_FIELD = "Name";
const CELL_FIELD = "Value";

export const runPasteLeadingEmptyRowsCase = async (
  bugCase: BugCaseFor<"paste-leading-empty-rows">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PasteLeadingEmptyRowsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.pastedValues.length < 2) {
    throw new Error(
      "two lines at least after the blank one - with one, a dropped blank and a paste that landed correctly are hard to tell apart",
    );
  }
  if (new Set(config.pastedValues).size !== config.pastedValues.length) {
    throw new Error(
      "the pasted values have to differ from each other, or a shift of one row would not show",
    );
  }

  try {
    const rowCount = config.pastedValues.length + 1;
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CELL_FIELD, type: FieldType.SingleLineText },
      ],
      records: Array.from({ length: rowCount }, (_, index) => ({
        fields: {
          [NAME_FIELD]: `row-${index}`,
          [CELL_FIELD]: `${config.existingPrefix}-${index}`,
        },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const cellFieldId = table.fields.find(
      (field: { name: string }) => field.name === CELL_FIELD,
    )?.id;
    if (!viewId || !cellFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readCells = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        viewId,
        take: rowCount,
      });
      return read.data.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => ({
          id: record.id,
          value: record.fields[cellFieldId] ?? null,
        }),
      );
    };

    // Fixture verification, outside the checkpoint: every row starts holding
    // its own distinct value. A table that started empty could not show a row
    // keeping an old value where a blank should have landed.
    const before = await readCells();
    const startedWith = before.map((row) => row.value);
    const expectedStart = Array.from(
      { length: rowCount },
      (_, index) => `${config.existingPrefix}-${index}`,
    );
    if (JSON.stringify(startedWith) !== JSON.stringify(expectedStart)) {
      throw new Error(
        `the rows start holding ${JSON.stringify(startedWith)}, expected ${JSON.stringify(expectedStart)}`,
      );
    }
    const recordIds = before.map((row) => row.id);

    const probe = await bugCheckpoint(
      "a-blank-first-line-empties-the-row-it-lands-on",
      async () => {
        // The block: a blank line, then the values. Written out the way a
        // clipboard carries it - one line per row.
        const content = ["", ...config.pastedValues].join("\n");
        const response = await axios.patch(
          urlBuilder(PASTE_BY_ID_URL, { tableId }),
          {
            viewId,
            selection: { recordIds, fieldIds: [cellFieldId] },
            projection: [cellFieldId],
            content,
            header: [],
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `pasting a block with a blank first line answered ${response.status}: ${JSON.stringify(response.data)}`,
          );
        }

        const after = await readCells();
        const landed = after.map((row) => row.value ?? "");
        const expected = ["", ...config.pastedValues];
        if (JSON.stringify(landed) !== JSON.stringify(expected)) {
          const firstKept = landed[0] !== "" && landed[0] === expectedStart[0];
          throw new Error(
            `the rows hold ${JSON.stringify(landed)}, expected ${JSON.stringify(expected)}` +
              (firstKept
                ? " - the blank first line was dropped, so every value landed one row up and the row that should have been emptied kept its old value"
                : ""),
          );
        }
        return { landed };
      },
    );

    return {
      details: {
        tableId,
        rows: rowCount,
        landed: probe.landed,
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
