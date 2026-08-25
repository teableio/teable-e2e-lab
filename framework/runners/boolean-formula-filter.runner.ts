import { FieldKeyType, FieldType, is } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { BooleanFormulaFilterCaseConfig } from "../types";

// A yes/no column worked out from a number -> filter it to the yes rows, and
// then to the rest -> checkpoint: each filter returns exactly those rows.
//
// A worked-out yes/no column is how a table answers a question about itself:
// over budget, past due, big enough to review. Filtering to the rows where it
// says yes is the only reason to have one - nobody reads the column, they read
// the rows it selects.
//
// The filter did not select them. A person cannot tell that from the screen:
// the rows they get back all look plausible, the column says what it says on
// each of them, and the ones that are missing are missing quietly. The number
// at the top agrees with the wrong list.
//
// Both directions are checked. The rows where the answer is no include the
// rows where there is no answer yet - a blank source has nothing to compare -
// and a filter that dropped those would be wrong in a way that only shows on
// half-filled tables.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const FLAG_FIELD = "Over the line";

export const runBooleanFormulaFilterCase = async (
  bugCase: BugCaseFor<"boolean-formula-filter">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: BooleanFormulaFilterCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const yesRows = config.rows.filter(
    (row) => row.amount != null && row.amount > config.threshold,
  );
  const otherRows = config.rows.filter(
    (row) => !(row.amount != null && row.amount > config.threshold),
  );
  if (yesRows.length === 0 || otherRows.length === 0) {
    throw new Error(
      "rows on both sides of the line - with all of them on one side, a filter that returns everything and a correct one look the same",
    );
  }
  if (!config.rows.some((row) => row.amount == null)) {
    throw new Error(
      "one row with no amount at all - the rows where the answer is no include the rows where there is no answer yet, and a filter that dropped those is only wrong on half-filled tables",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          ...(row.amount == null ? {} : { [AMOUNT_FIELD]: row.amount }),
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

    const flag = await createField(tableId, {
      name: FLAG_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${amountFieldId}} > ${config.threshold}` },
    });

    const namesFrom = (records: { fields: Record<string, unknown> }[]) =>
      records.map((record) => String(record.fields[NAME_FIELD])).sort();

    // Fixture verification, outside the checkpoint: the column answers yes on
    // exactly the rows the fixture says. A column that answered nothing would
    // make both filters below correct by returning nothing.
    let saidYes: string[] = [];
    for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.rows.length,
      });
      saidYes = read.data.records
        .filter(
          (record: { fields: Record<string, unknown> }) =>
            record.fields[FLAG_FIELD] === true,
        )
        .map((record: { fields: Record<string, unknown> }) =>
          String(record.fields[NAME_FIELD]),
        )
        .sort();
      if (saidYes.length > 0) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, config.settleIntervalMs),
      );
    }
    const expectedYes = yesRows.map((row) => row.name).sort();
    if (saidYes.join(" ") !== expectedYes.join(" ")) {
      throw new Error(
        `the column says yes on [${saidYes.join(", ")}], expected [${expectedYes.join(", ")}] - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "filtering-a-worked-out-yes-no-column-selects-those-rows",
      async () => {
        const yes = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rows.length,
          filter: {
            conjunction: "and",
            filterSet: [{ fieldId: flag.id, operator: is.value, value: true }],
          },
        });
        const gotYes = namesFrom(yes.data.records);
        if (gotYes.join(" ") !== expectedYes.join(" ")) {
          throw new Error(
            `filtering to the rows where the column says yes returned [${gotYes.join(", ")}], expected [${expectedYes.join(", ")}] - ` +
              "the rows that came back all look plausible and the ones missing are missing quietly",
          );
        }

        // The other direction, which is where the rows with no answer yet live.
        const no = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rows.length,
          filter: {
            conjunction: "and",
            filterSet: [{ fieldId: flag.id, operator: is.value, value: null }],
          },
        });
        const gotNo = namesFrom(no.data.records);
        const expectedNo = otherRows.map((row) => row.name).sort();
        if (gotNo.join(" ") !== expectedNo.join(" ")) {
          throw new Error(
            `filtering to the rest returned [${gotNo.join(", ")}], expected [${expectedNo.join(", ")}] - ` +
              "the rows where the answer is no include the rows where there is no answer yet",
          );
        }
        return { gotYes, gotNo };
      },
    );

    return {
      details: {
        tableId,
        threshold: config.threshold,
        yes: probe.gotYes,
        rest: probe.gotNo,
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
