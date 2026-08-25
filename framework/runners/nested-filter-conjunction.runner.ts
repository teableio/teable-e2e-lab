import { and, FieldKeyType, FieldType, is, or } from "@teable/core";
import {
  getRecords as apiGetRecords,
  getRowCount as apiGetRowCount,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NestedFilterConjunctionCaseConfig } from "../types";

// A filter with a group inside a group -> checkpoint: each group joins its own
// conditions its own way, and the count agrees with the rows.
//
// Groups are how a filter says something a flat list cannot: this, and either
// of those. The word between the conditions inside a group belongs to that
// group - that is the whole point of putting them in one - and a person builds
// the nesting precisely because "and" at the top and "or" inside are different
// questions.
//
// An inner group was joined with the word from the level above it. Asking for
// "either of these" got "both of these", which nothing satisfies, so rows
// vanish from a view whose filter reads correctly on screen. The person has
// built the filter they meant and the table disagrees with it.
//
// The count is read as well as the rows. It is the number at the top of the
// view, it is worked out separately, and a filter that two parts of the
// product read differently is worse than one they both read wrong.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";

export const runNestedFilterConjunctionCase = async (
  bugCase: BugCaseFor<"nested-filter-conjunction">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NestedFilterConjunctionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const wanted = [config.firstWanted, config.secondWanted];
  if (config.firstWanted === config.secondWanted) {
    throw new Error(
      "the two wanted values have to differ, or asking for either of them and asking for both would be the same question",
    );
  }
  if (config.statuses.filter((value) => !wanted.includes(value)).length === 0) {
    throw new Error(
      "at least one row outside the two wanted values - otherwise a filter that returns everything looks correct",
    );
  }
  for (const value of wanted) {
    if (!config.statuses.includes(value)) {
      throw new Error(
        `no row holds ${value}, so the filter would be asking for something that is not there`,
      );
    }
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: STATUS_FIELD, type: FieldType.Number },
      ],
      records: config.statuses.map((value, index) => ({
        fields: { [NAME_FIELD]: `row-${index}`, [STATUS_FIELD]: value },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const statusFieldId = table.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    )?.id;
    if (!viewId || !statusFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // The filter a person builds: at the top, everything has to hold; inside,
    // either of two things does. The second of those two is itself in a group,
    // which is the level that was joined with the wrong word.
    const filter = {
      conjunction: and.value,
      filterSet: [
        {
          conjunction: or.value,
          filterSet: [
            {
              fieldId: statusFieldId,
              operator: is.value,
              value: config.firstWanted,
            },
            {
              conjunction: and.value,
              filterSet: [
                {
                  fieldId: statusFieldId,
                  operator: is.value,
                  value: config.secondWanted,
                },
              ],
            },
          ],
        },
      ],
    };

    // Fixture verification, outside the checkpoint: unfiltered, every row is
    // there. A table that came back short would make the filtered answer
    // unreadable.
    const all = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId,
      take: config.statuses.length,
    });
    if (all.data.records.length !== config.statuses.length) {
      throw new Error(
        `the table lists ${all.data.records.length} of ${config.statuses.length} rows before any filter`,
      );
    }

    const probe = await bugCheckpoint(
      "each-group-in-a-filter-joins-its-own-conditions",
      async () => {
        const filtered = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId,
          take: config.statuses.length,
          filter,
        });
        const found = filtered.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            Number(record.fields[STATUS_FIELD]),
          )
          .sort((left, right) => left - right);
        const expected = [...wanted].sort((left, right) => left - right);
        if (found.join(",") !== expected.join(",")) {
          throw new Error(
            `the filter returned rows holding ${JSON.stringify(found)}, expected ${JSON.stringify(expected)} - ` +
              (found.length === 0
                ? "asking for either of two values got both of them, which nothing satisfies"
                : "the inner group was joined with the word from the level above it"),
          );
        }

        // The number at the top of the view, worked out separately.
        const counted = await apiGetRowCount(tableId, { viewId, filter });
        if (counted.data.rowCount !== found.length) {
          throw new Error(
            `the count says ${counted.data.rowCount} and the view lists ${found.length} - ` +
              "the two parts of the product read the same filter differently",
          );
        }
        return { found, rowCount: counted.data.rowCount };
      },
    );

    return {
      details: {
        tableId,
        statuses: config.statuses,
        found: probe.found,
        rowCount: probe.rowCount,
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
