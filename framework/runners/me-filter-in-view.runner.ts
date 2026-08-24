import { FieldKeyType, FieldType } from "@teable/core";
import { axios, getRecords as apiGetRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { MeFilterInViewCaseConfig } from "../types";

// A view saved with the filter "assigned to me" -> open it -> checkpoint: the
// rows assigned to whoever is looking come back.
//
// "Assigned to me" is the first view most people make and the one they open
// every morning. It is saved once, by one person, and it has to mean something
// different for each of them - the filter stores the word "me", not a name.
//
// The word was passed to the database as itself, so it matched nobody and the
// view came back empty. An empty view of your own work reads as "you have
// nothing to do", which is the one wrong answer nobody double-checks.
//
// The fixture holds a row assigned to the person looking and a row assigned to
// nobody, so an empty answer and an unfiltered one are both visibly wrong.

const NAME_FIELD = "Name";
const USER_FIELD = "Assignee";

export const runMeFilterInViewCase = async (
  bugCase: BugCaseFor<"me-filter-in-view">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: MeFilterInViewCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const me = {
    id: globalThis.testConfig.userId,
    title: globalThis.testConfig.userName,
  };
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
      records: [
        { fields: { [NAME_FIELD]: config.mineRowTitle, [USER_FIELD]: me } },
        { fields: { [NAME_FIELD]: config.unassignedRowTitle } },
      ],
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const userFieldId = table.fields.find(
      (field: { name: string }) => field.name === USER_FIELD,
    )?.id;
    if (!viewId || !userFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Save the filter on the view, the way the person who made the view did:
    // the word, not their own name.
    const saved = await axios.put(
      `/table/${tableId}/view/${viewId}/filter`,
      {
        filter: {
          conjunction: "and",
          filterSet: [{ fieldId: userFieldId, operator: "is", value: "Me" }],
        },
      },
      { validateStatus: () => true },
    );
    if (saved.status < 200 || saved.status >= 300) {
      throw new Error(
        `saving the "assigned to me" filter answered ${saved.status}: ${JSON.stringify(saved.data)}`,
      );
    }

    // Fixture verification, outside the checkpoint: without the view, both
    // rows are there. An empty answer later then means the filter, not the
    // table.
    const all = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: 2,
    });
    if (all.data.records.length !== 2) {
      throw new Error(
        `the table holds ${all.data.records.length} rows, expected 2 - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-view-filtered-to-me-shows-my-rows",
      async () => {
        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId,
          take: 2,
        });
        const routing = assertServedByV2(read.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const names = read.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD] ?? ""),
          )
          .sort();
        if (names.join(",") !== config.mineRowTitle) {
          throw new Error(
            `the view shows ${JSON.stringify(names)}, expected only ${JSON.stringify(config.mineRowTitle)}` +
              (names.length === 0
                ? " - an empty view of your own work reads as having nothing to do"
                : " - the filter did not narrow the view to the person looking at it"),
          );
        }
        return { routing, names };
      },
    );

    return {
      details: { tableId, viewId, rows: probe.names, routing: probe.routing },
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
