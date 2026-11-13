import { FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  NewFieldVisibleInUnhiddenViewCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A table with two grid views; in the first, a column is hidden and shown
// again, so that view hides nothing -> a new column is created from the
// second view -> checkpoint: the first view shows the new column.
//
// A grid view that hides some columns keeps new columns hidden, so they do not
// clutter a view someone curated. Hiding and showing a column again left a
// "shown" entry behind, and the view was treated as curated: every column a
// colleague added afterwards silently never appeared in it.

const NOTES = "Notes";

export const runNewFieldVisibleInUnhiddenViewCase = async (
  bugCase: BugCaseFor<"new-field-visible-in-unhidden-view">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NewFieldVisibleInUnhiddenViewCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTES, type: FieldType.SingleLineText },
      ],
      records: [],
    });
    tableIds.push(table.id);
    const notesId = table.fields[1].id;
    const untouchedViewId = table.views[0].id;
    const other = await rawRequest<{ id?: string }>(
      "POST",
      `/table/${table.id}/view`,
      { name: "Editing", type: "grid" },
    );
    if (!isSuccess(other) || !other.data?.id) {
      throw new Error(
        `creating a second view answered ${describeResponse(other)}`,
      );
    }
    const editingViewId = other.data.id;

    for (const hidden of [true, false]) {
      const set = await rawRequest(
        "PUT",
        `/table/${table.id}/view/${untouchedViewId}/column-meta`,
        [{ fieldId: notesId, columnMeta: { hidden } }],
      );
      if (!isSuccess(set)) {
        throw new Error(
          `${hidden ? "hiding" : "showing"} the column answered ${describeResponse(set)}`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "a-view-that-hides-nothing-shows-new-columns",
      async () => {
        const created = await rawRequest<{ id?: string }>(
          "POST",
          `/table/${table.id}/field`,
          {
            name: "Added",
            type: FieldType.SingleLineText,
            viewId: editingViewId,
          },
        );
        if (!isSuccess(created) || !created.data?.id) {
          throw new Error(
            `creating the column answered ${describeResponse(created)}`,
          );
        }
        const view = await rawRequest<{
          columnMeta?: Record<string, { hidden?: boolean }>;
        }>("GET", `/table/${table.id}/view/${untouchedViewId}`);
        const meta = view.data.columnMeta ?? {};
        if (meta[created.data.id]?.hidden === true) {
          throw new Error(
            "the new column is hidden in a view that hides no column, so it never appears there",
          );
        }
        if (meta[notesId]?.hidden === true) {
          throw new Error(
            "the column shown again is hidden, so the fixture is not what the case expects",
          );
        }
        return { addedHidden: meta[created.data.id]?.hidden ?? null };
      },
    );
    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
