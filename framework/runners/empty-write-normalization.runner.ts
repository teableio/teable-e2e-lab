import { FieldKeyType, FieldType, isEmpty } from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { EmptyWriteNormalizationCaseConfig } from "../types";

// Clear three cells the way the interface clears them - blank text, an
// unticked box, an empty list of tags -> checkpoint: the cells read back empty
// and a filter for empty cells finds the row.
//
// There are two ways to say a cell has nothing in it. The interface says it
// one way: deleting the text leaves an empty piece of text, unticking the box
// leaves a no, removing every tag leaves an empty list. Somewhere underneath,
// a cell that was never filled in says it the other way - it holds nothing at
// all.
//
// Those two were stored as they arrived rather than being made the same. A
// cleared cell then looks empty on screen and is not empty to anything that
// asks: filters for empty cells skip the row, summaries count it as filled,
// and the person is looking at a blank cell that the product insists has
// something in it.
//
// The filter is the half of the checkpoint that makes this a report rather
// than a detail about storage - it is the place a person meets the difference.

const NAME_FIELD = "Name";
const NOTES_FIELD = "Notes";
const DONE_FIELD = "Done";
const TAGS_FIELD = "Tags";

export const runEmptyWriteNormalizationCase = async (
  bugCase: BugCaseFor<"empty-write-normalization">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: EmptyWriteNormalizationCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTES_FIELD, type: FieldType.LongText },
        { name: DONE_FIELD, type: FieldType.Checkbox },
        {
          name: TAGS_FIELD,
          type: FieldType.MultipleSelect,
          options: { choices: config.tags.map((tag) => ({ name: tag })) },
        },
      ],
      // A second row that is left alone, so a filter for empty cells has
      // something to be wrong about in both directions: it must find the
      // cleared row and must not lose the row that was never filled in.
      records: [
        {
          fields: {
            [NAME_FIELD]: config.filledRowName,
            [NOTES_FIELD]: config.notes,
            [DONE_FIELD]: true,
            [TAGS_FIELD]: config.tags,
          },
        },
        { fields: { [NAME_FIELD]: config.untouchedRowName } },
      ],
    });
    tableId = table.id;
    const filledRowId = table.records?.[0]?.id;
    const notesFieldId = table.fields.find(
      (field: { name: string }) => field.name === NOTES_FIELD,
    )?.id;
    if (!filledRowId || !notesFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const emptyNotesFilter = {
      conjunction: "and" as const,
      filterSet: [
        { fieldId: notesFieldId, operator: isEmpty.value, value: null },
      ],
    };

    // Fixture verification, outside the checkpoint: before anything is
    // cleared, the filled row is filled and the filter for empty notes finds
    // only the row that was never filled in. Without this, a filter that
    // simply finds everything - or nothing - would look like the right answer
    // after the clear.
    const before = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: 10,
      filter: emptyNotesFilter,
    });
    const beforeNames = before.data.records
      .map((record: { fields: Record<string, unknown> }) =>
        String(record.fields[NAME_FIELD]),
      )
      .sort();
    if (beforeNames.join(" ") !== config.untouchedRowName) {
      throw new Error(
        `before the clear, the filter for empty notes finds [${beforeNames.join(", ")}], expected only ${config.untouchedRowName}`,
      );
    }

    const probe = await bugCheckpoint(
      "clearing-a-cell-leaves-it-empty",
      async () => {
        // Exactly what the interface sends when a person deletes the text,
        // unticks the box and removes the last tag.
        const cleared = await apiUpdateRecord(tableId, filledRowId, {
          fieldKeyType: FieldKeyType.Name,
          record: {
            fields: {
              [NOTES_FIELD]: "",
              [DONE_FIELD]: false,
              [TAGS_FIELD]: [],
            },
          },
        });
        const routing = assertServedByV2(cleared.headers, {
          operation: "PATCH /table/{tableId}/record/{recordId}",
          feature: "updateRecord",
        });

        const read = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 10,
        });
        const row = read.data.records.find(
          (record: { id: string }) => record.id === filledRowId,
        );
        if (!row) {
          throw new Error("the cleared row is gone");
        }
        const stillHolding = Object.entries({
          [NOTES_FIELD]: row.fields[NOTES_FIELD],
          [DONE_FIELD]: row.fields[DONE_FIELD],
          [TAGS_FIELD]: row.fields[TAGS_FIELD],
        }).filter(([, value]) => value != null);
        if (stillHolding.length > 0) {
          throw new Error(
            `${stillHolding.length} of 3 cleared cells still hold a value: ${JSON.stringify(
              Object.fromEntries(stillHolding),
            )} - the cell is blank on screen and not empty underneath`,
          );
        }

        // Where a person meets it: the filter for empty notes has to find the
        // row that was just cleared, and still find the one never filled in.
        const filtered = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 10,
          filter: emptyNotesFilter,
        });
        const names = filtered.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
          )
          .sort();
        const expected = [config.filledRowName, config.untouchedRowName].sort();
        if (names.join(" ") !== expected.join(" ")) {
          throw new Error(
            `the filter for empty notes finds [${names.join(", ")}], expected [${expected.join(", ")}] - ` +
              "the cleared cell is blank on screen and the filter does not count it as empty",
          );
        }
        return { routing, names };
      },
    );

    return {
      details: {
        tableId,
        clearedRecordId: filledRowId,
        routing: probe.routing,
        emptyNotesRows: probe.names,
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
