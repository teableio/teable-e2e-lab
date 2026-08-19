import { FieldKeyType, FieldType, hasAnyOf, is } from "@teable/core";
import {
  createRecords,
  createTable,
  getRecords,
  getView,
  getViews,
  permanentDeleteTable,
  updateViewFilter,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertV2Routing } from "../v2-routing";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ViewFilterRoundtripCaseConfig } from "../types";

// Create a table with a text and a multiple-select field -> seed rows -> save a
// view filter holding one complete condition and one condition the user has
// not finished yet -> checkpoint: read the view back and prove the filter
// survived verbatim, then read the rows and prove the unfinished condition
// filtered nothing.
//
// Both halves matter and they pull in opposite directions. Persisting the
// unfinished condition is what the filter panel needs (dropping it is what
// made the newly picked field vanish under the user's cursor); ignoring it at
// query time is what keeps the view usable while it is being edited. A fix
// that only did the first would hide every row behind an empty "is any of []".

const TITLE_FIELD = "Title";
const SELECT_FIELD = "Tags";

type SavedFilter = {
  conjunction: string;
  filterSet: { fieldId: string; operator: string; value: unknown }[];
};

// The product answers the same conditions with the keys in its own order, so
// comparing the raw JSON would report "the filter came back changed" on every
// run. Canonicalising to (fieldId, operator, value) triples compares what the
// filter MEANS - which is exactly what the bug destroyed, a whole condition
// going missing. The fixture filter is flat by construction; a nested group
// would need this to recurse.
const canonicalFilter = (filter: unknown): string => {
  const group = filter as SavedFilter | null | undefined;
  return JSON.stringify({
    conjunction: group?.conjunction ?? null,
    filterSet: (group?.filterSet ?? []).map((condition) => [
      condition.fieldId ?? null,
      condition.operator ?? null,
      condition.value ?? null,
    ]),
  });
};

const buildFilter = (
  titleFieldId: string,
  selectFieldId: string,
  matchedTitle: string,
): SavedFilter => ({
  conjunction: "and",
  filterSet: [
    // The finished half. It exists so the view still means something after the
    // unfinished half is ignored - without it, "the rows came back" would be
    // true even if the filter had been thrown away entirely.
    { fieldId: titleFieldId, operator: is.value, value: matchedTitle },
    // The unfinished half: a list operator with no value yet, exactly what the
    // filter panel writes the moment the user picks a field.
    { fieldId: selectFieldId, operator: hasAnyOf.value, value: null },
  ],
});

export const runViewFilterRoundtripCase = async (
  bugCase: BugCaseFor<"view-filter-roundtrip">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ViewFilterRoundtripCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (!config.rowTitles.includes(config.matchedTitle)) {
    throw new Error(
      `matchedTitle "${config.matchedTitle}" is not one of rowTitles [${config.rowTitles.join(", ")}] - the case cannot run`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText },
        {
          name: SELECT_FIELD,
          type: FieldType.MultipleSelect,
          options: {
            choices: config.choices.map((name) => ({ name })),
          },
        },
      ],
      records: [],
    });
    tableId = table.id;

    const titleField = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    );
    const selectField = table.fields.find(
      (field: { name: string }) => field.name === SELECT_FIELD,
    );
    if (!titleField || !selectField) {
      throw new Error(`Table ${tableId} is missing its fixture fields`);
    }

    await createRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: config.rowTitles.map((title) => ({
        fields: { [TITLE_FIELD]: title },
      })),
    });

    const view = (await getViews(tableId))[0];
    if (!view) {
      throw new Error(`Table ${tableId} has no default view`);
    }

    // Fixture verification, outside the checkpoint: with no filter saved yet
    // the view must show every seeded row. Everything below reads "which rows
    // the view returns", so a view that already hid rows would make the
    // checkpoint answer a different question.
    const unfiltered = await getRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId: view.id,
      take: config.rowTitles.length,
    });
    if (unfiltered.records.length !== config.rowTitles.length) {
      throw new Error(
        `Seed did not land: view ${view.id} returned ${unfiltered.records.length} rows, expected ${config.rowTitles.length}`,
      );
    }

    // The view filter schema that dropped the condition is v2's. Proving v2
    // answers here, in setup, is what keeps a v1-routed run from reporting a
    // green row that means nothing.
    const routingReason = await assertV2Routing(tableId);

    const filter = buildFilter(
      titleField.id,
      selectField.id,
      config.matchedTitle,
    );

    const probe = await bugCheckpoint(
      "incomplete-condition-survives-and-filters-nothing",
      async () => {
        await updateViewFilter(tableId, view.id, { filter });

        const savedFilter = (await getView(tableId, view.id)).filter;
        if (canonicalFilter(savedFilter) !== canonicalFilter(filter)) {
          throw new Error(
            `the saved view filter came back changed: got ${JSON.stringify(savedFilter)}, sent ${JSON.stringify(filter)}`,
          );
        }

        const filtered = await getRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId: view.id,
          take: config.rowTitles.length,
        });
        const titles = filtered.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[TITLE_FIELD]),
          )
          .sort();
        if (titles.join(" ") !== [config.matchedTitle].join(" ")) {
          throw new Error(
            `the saved view returned [${titles.join(", ")}], expected only [${config.matchedTitle}] - the unfinished condition must filter nothing`,
          );
        }

        return { savedFilter, titles };
      },
    );

    return {
      details: {
        tableId,
        tableName,
        routingReason,
        sentFilter: filter,
        savedFilter: probe.savedFilter,
        returnedTitles: probe.titles,
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
