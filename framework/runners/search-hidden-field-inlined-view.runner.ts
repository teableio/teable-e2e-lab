import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  getRowCount as apiGetRowCount,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SearchHiddenFieldInlinedViewCaseConfig } from "../types";

// A column hidden in a view -> search that view for a word that only appears in
// the hidden column, the way the grid asks -> checkpoint: nothing comes back.
//
// Hiding a column is how a view is made to show one thing. A search inside that
// view is a search of what the view shows; a row that matches only in a column
// the view does not show is a result nobody can see the reason for - it looks
// like the search matching a row at random.
//
// The grid does not send "use the view": it reads the view's filter and sort,
// inlines them into the request, and sets ignoreViewQuery. That flag was read
// as "there is no view here at all", so which columns the view hides stopped
// being applied and the search fell back to every column in the table. The view
// id was in the request the whole time.
//
// Two request shapes, because the grid sends both: one naming the columns it
// draws, and one naming none - the id-only read behind the rows a grid asks
// for. They took different paths to the same fallback.

const TITLE_FIELD = "Title";
const NOTE_FIELD = "Notes";

export const runSearchHiddenFieldInlinedViewCase = async (
  bugCase: BugCaseFor<"search-hidden-field-inlined-view">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SearchHiddenFieldInlinedViewCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const hiddenMatches = config.rows.filter((row) =>
    row.note.includes(config.hiddenTerm),
  );
  const visibleMatches = config.rows.filter((row) =>
    row.title.includes(config.hiddenTerm),
  );
  if (hiddenMatches.length === 0) {
    throw new Error(
      `no row holds ${JSON.stringify(config.hiddenTerm)} in the hidden column - there would be nothing for the ` +
        "search to wrongly return",
    );
  }
  if (visibleMatches.length > 0) {
    throw new Error(
      `${JSON.stringify(config.hiddenTerm)} also appears in the visible column - the correct answer would not be ` +
        "empty and the case could not tell a scoped search from an unscoped one",
    );
  }
  const visibleTermMatches = config.rows.filter((row) =>
    row.title.includes(config.visibleTerm),
  );
  if (visibleTermMatches.length === 0) {
    throw new Error(
      `no row holds ${JSON.stringify(config.visibleTerm)} in the visible column - the control half of the ` +
        "checkpoint would pass on a search that stopped matching anything at all",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rows.map((row) => ({
        fields: { [TITLE_FIELD]: row.title, [NOTE_FIELD]: row.note },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const titleFieldId = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    )?.id;
    const noteFieldId = table.fields.find(
      (field: { name: string }) => field.name === NOTE_FIELD,
    )?.id;
    if (!viewId || !titleFieldId || !noteFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const hidden = await axios.put(
      `/table/${tableId}/view/${viewId}/column-meta`,
      [{ fieldId: noteFieldId, columnMeta: { hidden: true } }],
      { validateStatus: () => true },
    );
    if (hidden.status < 200 || hidden.status >= 300) {
      throw new Error(
        `hiding the column answered ${hidden.status}: ${JSON.stringify(hidden.data)}`,
      );
    }

    const search: [string, string, boolean] = [config.hiddenTerm, "", true];

    // Fixture verification, outside the checkpoint: the view really hides the
    // column, and the term really is in it. Without both, an empty result would
    // mean the search found nothing rather than the hiding being applied.
    const view = await axios.get(`/table/${tableId}/view/${viewId}`, {
      validateStatus: () => true,
    });
    const columnMeta = (
      view.data as { columnMeta?: Record<string, { hidden?: boolean }> }
    )?.columnMeta;
    if (columnMeta?.[noteFieldId]?.hidden !== true) {
      throw new Error(
        `the view describes the column as ${JSON.stringify(columnMeta?.[noteFieldId] ?? null)}, expected hidden - ` +
          "the fixture is not in place",
      );
    }
    const unscoped = await apiGetRowCount(tableId, { search });
    if (unscoped.data.rowCount !== hiddenMatches.length) {
      throw new Error(
        `searching the whole table for ${JSON.stringify(config.hiddenTerm)} counts ${unscoped.data.rowCount} rows, ` +
          `expected ${hiddenMatches.length} - the term does not select what the fixture thinks it does`,
      );
    }

    const probe = await bugCheckpoint(
      "a-search-inside-a-view-stays-inside-what-it-shows",
      async () => {
        // What the grid sends: the view's own filter and sort inlined,
        // ignoreViewQuery set, and the columns it draws named.
        const rendered = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId,
          ignoreViewQuery: true,
          projection: [titleFieldId],
          search,
          take: config.rows.length,
        });
        const routing = assertServedByV2(rendered.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        if (rendered.data.records.length !== 0) {
          throw new Error(
            `searching the view for ${JSON.stringify(config.hiddenTerm)} returned ` +
              `${rendered.data.records.length} rows, expected none - they match only in the column the view hides, ` +
              "so nothing on screen says why they are results",
          );
        }

        // The same request without naming any column - the id-only read behind
        // the rows a grid asks for, which took its own path to the same
        // fallback.
        const idsOnly = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId,
          ignoreViewQuery: true,
          search,
          take: config.rows.length,
        });
        if (idsOnly.data.records.length !== 0) {
          throw new Error(
            `the same search without naming any column returned ${idsOnly.data.records.length} rows, expected none - ` +
              "the rows a grid asks for and the columns it draws disagree about what the view shows",
          );
        }

        // The control: the view still searches the column it does show.
        // Without it, a search that had stopped matching anything would satisfy
        // both assertions above.
        const control = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId,
          ignoreViewQuery: true,
          projection: [titleFieldId],
          search: [config.visibleTerm, "", true],
          take: config.rows.length,
        });
        if (control.data.records.length !== visibleTermMatches.length) {
          throw new Error(
            `searching the same view for ${JSON.stringify(config.visibleTerm)}, which is in the column it shows, ` +
              `returned ${control.data.records.length} rows, expected ${visibleTermMatches.length} - the search is ` +
              "not scoped to the view, it has stopped working",
          );
        }
        return { routing, control: control.data.records.length };
      },
    );

    return {
      details: {
        tableId,
        hiddenTerm: config.hiddenTerm,
        hiddenMatches: hiddenMatches.length,
        visibleTerm: config.visibleTerm,
        visibleTermMatches: probe.control,
        routing: probe.routing,
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
