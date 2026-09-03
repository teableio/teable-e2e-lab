import { FieldType } from "@teable/core";
import { axios, GET_VIEW_LIST, urlBuilder } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LegacyColumnVisibilityMetadataCaseConfig } from "../types";

// A view whose stored notes about a column are of a shape nothing writes any
// more -> open the table -> checkpoint: the view comes back, and the entry is
// settled.
//
// Two shapes, on one runner because the fixture and the observation are the
// same: write notes no request produces, then read the views.
//
// Which columns a view shows has been recorded two ways over the life of this
// product: an older note saying whether a column is SHOWN, and the current one
// saying whether it is HIDDEN. Views made long enough ago carry both, and no
// request writes that shape any more - it is simply what is in the table.
//
// Read back, the two were passed through side by side. What a view says about a
// column is checked on the way out, and an entry carrying a note nobody expects
// any more does not pass that check: the request for the table's views failed,
// which is every view at once rather than one column in one of them.
//
// So the checkpoint asks for the views at all, and then asks that the entry has
// been settled into one answer - the older note gone, the current one kept. A
// request that came back carrying both would be the same contradiction handed
// to whatever reads it next.

const NAME_FIELD = "Name";
const OTHER_FIELD = "Other";

export const runLegacyColumnVisibilityMetadataCase = async (
  bugCase: BugCaseFor<"legacy-column-visibility-metadata">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LegacyColumnVisibilityMetadataCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: OTHER_FIELD, type: FieldType.SingleLineText },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const columnId = table.fields.find(
      (field: { name: string }) => field.name === OTHER_FIELD,
    )?.id as string;
    if (!viewId || !columnId) {
      throw new Error("the table has no view or no second column");
    }

    const readViews = async () =>
      axios.get(urlBuilder(GET_VIEW_LIST, { tableId }), {
        validateStatus: () => true,
      });

    const before = await readViews();
    if (before.status !== 200) {
      throw new Error(
        `the views do not read before anything is done to them (${before.status}): ${JSON.stringify(before.data)}`,
      );
    }
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/view",
      feature: "getViews",
    });

    // What a view made long enough ago carries. Written with SQL because
    // nothing writes either shape any more.
    const db = fixtureDb(context.app);
    const columnIndex = table.fields.findIndex(
      (field: { id: string }) => field.id === columnId,
    );
    const legacy =
      config.legacy === "bothVisibilityNotes"
        ? {
            [columnId]: {
              order: config.order,
              visible: true,
              hidden: false,
              width: config.width,
            },
          }
        : // No position at all - the other shape old views carry.
          { [columnId]: { width: config.width } };
    await db.execute(
      `UPDATE "view" SET "column_meta" = $1 WHERE "id" = $2`,
      JSON.stringify(legacy),
      viewId,
    );

    // Fixture verification, outside the checkpoint: the older note really is in
    // the table. Without it there is nothing unexpected to read back and the
    // case would report on nothing.
    const stored = await db.query<{ columnMeta: string }[]>(
      `SELECT "column_meta" AS "columnMeta" FROM "view" WHERE "id" = $1`,
      viewId,
    );
    const storedText = String(stored[0]?.columnMeta ?? "");
    const missingMark =
      config.legacy === "bothVisibilityNotes" ? '"visible"' : '"order"';
    const present = storedText.includes(missingMark);
    if (config.legacy === "bothVisibilityNotes" ? !present : present) {
      throw new Error(
        `the stored notes are not the shape this case is about (${config.legacy}): ${storedText} - ` +
          "the fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-view-with-old-notes-about-a-column-still-reads",
      async () => {
        const listed = await readViews();
        const body =
          typeof listed.data === "string"
            ? listed.data
            : JSON.stringify(listed.data ?? "");
        if (listed.status !== 200) {
          throw new Error(
            `asking for the table's views answered ${listed.status} - that is every view at once, ` +
              `not one column in one of them: ${body}`,
          );
        }

        const view = (
          listed.data as { id: string; columnMeta?: Record<string, unknown> }[]
        ).find((candidate) => candidate.id === viewId);
        const entry = view?.columnMeta?.[columnId] as
          | Record<string, unknown>
          | undefined;
        if (!entry) {
          throw new Error(
            `the view came back with nothing about the column: ${body}`,
          );
        }
        if (config.legacy === "bothVisibilityNotes") {
          if ("visible" in entry) {
            throw new Error(
              `the view still says both things about the column: ${JSON.stringify(entry)} - ` +
                "whatever reads this next is handed the contradiction",
            );
          }
          if (entry.hidden !== false) {
            throw new Error(
              `the view came back saying the column is ${JSON.stringify(entry.hidden)}, expected false: ` +
                JSON.stringify(entry),
            );
          }
        } else {
          // The entry has to come back with a position. Where a column sits is
          // not optional to whatever draws the view, and the stored notes do
          // not say.
          if (entry.order !== columnIndex) {
            throw new Error(
              `the view came back with the column at ${JSON.stringify(entry.order)}, expected ` +
                `${columnIndex} - its place among the columns: ${JSON.stringify(entry)}`,
            );
          }
        }
        // Either way, what the notes did carry survives.
        if (entry.width !== config.width) {
          throw new Error(
            `the width was ${JSON.stringify(entry.width)}, expected ${config.width}: ${JSON.stringify(entry)}`,
          );
        }
        return { entry };
      },
    );

    return {
      details: { tableId, viewId, columnId, routing, ...probe },
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
