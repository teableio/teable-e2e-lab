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

    const showAsOf = (field: { options?: { showAs?: { type?: string } } }) =>
      field.options?.showAs?.type;

    // Fixture verification, outside the checkpoint: the request was accepted
    // and made a long-text column. What the product *says* about that column
    // is not checked here on purpose - leaving the setting out of its own
    // description is the first half of the failure, so it belongs inside the
    // checkpoint rather than in the fixture.
    if (notes.type !== FieldType.LongText) {
      throw new Error(
        `the column is a ${notes.type}, expected a long-text column - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "editing-a-markdown-column-keeps-it-rendering",
      async () => {
        // What the editor does: read the column, then send back what it read
        // with the one thing the person changed.
        const asReported = await getField(tableId, notes.id);
        if (showAsOf(asReported) !== "markdown") {
          throw new Error(
            `asked about the column it just made, the product says it shows ${JSON.stringify(showAsOf(asReported))}, expected markdown - ` +
              "the editor draws what it is told, so the setting is already absent from the screen before anyone saves anything",
          );
        }
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
