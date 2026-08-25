import { FieldType } from "@teable/core";
import { convertField as apiConvertField } from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LongtextMarkdownConvertCaseConfig } from "../types";

// A long-text column set to render as Markdown -> edit the column, sending
// back the settings the product itself reports for it -> checkpoint: it still
// renders as Markdown.
//
// Rendering as Markdown is why the column is a long-text column: it is where
// notes with headings, lists and links live, and it is chosen once and then
// forgotten about. Editing something else on the column - its name, its
// description - is not a decision to go back to plain text.
//
// The field editor works by reading the column, showing what it reads, and
// sending all of it back when the person saves. What it read did not mention
// Markdown, so what it sent back did not either, and the setting was gone. The
// notes are still there and they are suddenly full of asterisks and hashes.
//
// The case sends back exactly what the product reports rather than a body it
// composed, because that is what the editor does and it is the whole failure:
// a description that leaves something out becomes an edit that removes it.

const NAME_FIELD = "Name";
const NOTES_FIELD = "Notes";

export const runLongtextMarkdownConvertCase = async (
  bugCase: BugCaseFor<"longtext-markdown-convert">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LongtextMarkdownConvertCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.renamedTo === NOTES_FIELD) {
    throw new Error(
      "the new name has to differ from the old one, or nothing is being edited",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "a-row" } }],
    });
    tableId = table.id;

    const notes = await createField(tableId, {
      name: NOTES_FIELD,
      type: FieldType.LongText,
      options: { showAs: { type: "markdown" } },
    });

    // Fixture verification, outside the checkpoint: the column was made
    // rendering as Markdown. A column that never carried the setting could not
    // lose it.
    const showAsOf = (field: { options?: { showAs?: { type?: string } } }) =>
      field.options?.showAs?.type;
    if (showAsOf(notes) !== "markdown") {
      throw new Error(
        `the column was made showing ${JSON.stringify(showAsOf(notes))}, expected markdown - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "editing-a-markdown-column-keeps-it-rendering",
      async () => {
        // What the editor does: read the column, then send back what it read
        // with the one thing the person changed.
        const asReported = await getField(tableId, notes.id);
        await apiConvertField(tableId, notes.id, {
          name: config.renamedTo,
          type: FieldType.LongText,
          options: asReported.options ?? {},
        });

        const after = await getField(tableId, notes.id);
        if (after.name !== config.renamedTo) {
          throw new Error(
            `the column is named ${JSON.stringify(after.name)}, expected ${JSON.stringify(config.renamedTo)} - the edit did not take`,
          );
        }
        if (showAsOf(after) !== "markdown") {
          throw new Error(
            `the column now shows ${JSON.stringify(showAsOf(after))}, expected markdown - ` +
              "what the product reported about the column left the setting out, so sending that back removed it",
          );
        }
        return {
          reportedBeforeEdit: showAsOf(asReported),
          showsAfter: showAsOf(after),
        };
      },
    );

    return {
      details: {
        tableId,
        fieldId: notes.id,
        reportedBeforeEdit: probe.reportedBeforeEdit ?? null,
        showsAfter: probe.showsAfter,
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
