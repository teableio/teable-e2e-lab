import { and, FieldKeyType, FieldType, isGreater } from "@teable/core";
import { getRecords as apiGetRecords, getRowCount } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AutonumberStringFilterCaseConfig } from "../types";

// A view filtered on the row-number column, "greater than 50" -> checkpoint:
// the row count comes back, and the rows behind it are the ones the filter
// describes.
//
// The number typed into a filter box arrives as text - that is what a text box
// produces, and it is what the grid sends for every numeric column. The
// row-number column was the one place that was not allowed for: the comparison
// demanded an actual number, refused the string, and answered 500. The page
// showed the filter as saved and then broke on the count, so the view a person
// had just built would not open at all.
//
// A saved filter is worse than a failed one: it is loaded again on every visit,
// so the view stays broken until someone works out that the filter is what did
// it.
//
// The count is checked against the rows, not against a number written into the
// case. Comparing two answers from the product catches the failure a hardcoded
// expectation cannot: a count that returns a plausible-looking wrong number
// while the rows disagree with it.

const TITLE_FIELD = "Title";
const ROW_NUMBER_FIELD = "No.";

export const runAutonumberStringFilterCase = async (
  bugCase: BugCaseFor<"autonumber-string-filter">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AutonumberStringFilterCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: `${suffix}-rows`,
      fields: [{ name: TITLE_FIELD, type: FieldType.SingleLineText }],
      records: config.rowTitles.map((title) => ({
        fields: { [TITLE_FIELD]: title },
      })),
    });
    tableId = table.id;

    // Added after the rows, which is how a real table gets one: the column
    // numbers what is already there.
    const rowNumber = await createField(table.id, {
      name: ROW_NUMBER_FIELD,
      type: FieldType.AutoNumber,
    });

    // The engine assertion, on a read of this table's rows - the same endpoint
    // and the same feature the checkpoint's filtered read uses. The response
    // is also what the expected answer is derived from, so this is not a
    // separate probe.
    const listed = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      take: config.rowTitles.length,
    });
    const routing = assertServedByV2(listed.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const numbers = listed.data.records.map((record) =>
      Number(record.fields[rowNumber.id]),
    );
    if (numbers.some((value) => !Number.isFinite(value))) {
      throw new Error(
        `the row-number column did not number every row: ${JSON.stringify(numbers)}`,
      );
    }

    const expected = numbers
      .filter((value) => value > config.threshold)
      .sort((left, right) => left - right);
    if (expected.length === 0 || expected.length === numbers.length) {
      throw new Error(
        `"greater than ${config.threshold}" selects ${expected.length} of ${numbers.length} rows - ` +
          "a filter that selects all or none cannot tell a working comparison from a missing one",
      );
    }

    // What a filter box sends: the number as text.
    const filter = {
      conjunction: and.value,
      filterSet: [
        {
          fieldId: rowNumber.id,
          operator: isGreater.value,
          value: String(config.threshold),
        },
      ],
    };

    const probe = await bugCheckpoint(
      "a-row-number-filter-holding-text-counts-and-lists",
      async () => {
        // Refused before the fix, and a refusal throws here, which is the
        // report.
        const counted = await getRowCount(tableId, { filter });
        const rowCount = counted.data.rowCount;

        const filtered = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          filter,
        });
        const listedNumbers = filtered.data.records
          .map((record) => Number(record.fields[rowNumber.id]))
          .sort((left, right) => left - right);

        if (JSON.stringify(listedNumbers) !== JSON.stringify(expected)) {
          throw new Error(
            `"greater than ${config.threshold}" listed rows ${JSON.stringify(listedNumbers)}, ` +
              `expected ${JSON.stringify(expected)} out of ${JSON.stringify(numbers)}`,
          );
        }
        if (rowCount !== expected.length) {
          throw new Error(
            `the count says ${rowCount} row(s) while the same filter lists ` +
              `${JSON.stringify(listedNumbers)}`,
          );
        }
        return { rowCount, listedNumbers };
      },
    );

    return {
      details: {
        tableId,
        rowNumberFieldId: rowNumber.id,
        threshold: config.threshold,
        allNumbers: numbers,
        routing,
        ...probe,
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
