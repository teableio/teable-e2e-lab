import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  SortFunc,
  TimeFormatting,
} from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TrackedModifiedSortCaseConfig } from "../types";

// A "last changed" column set to watch one column only -> edit a column it is
// not watching -> checkpoint: sorting by it puts the rows in the order it is
// showing.
//
// A "last changed" column can be narrowed to the columns a team actually cares
// about: when did this order's status last move, ignoring the notes somebody
// tidied up afterwards. Narrowing it is the whole point - the unnarrowed
// version answers a question nobody asked.
//
// The narrowing reached the value on screen and not the sort. Sorting by that
// column then produced an order the column itself contradicts: the row at the
// top does not show the latest time, and the times are right there to read.
// Nobody suspects the sort - they suspect the timestamps, and there is nothing
// wrong with them.
//
// The checkpoint compares the order against the values the same request
// returned rather than against a time the case worked out, because the
// question is whether the product agrees with itself.

const NAME_FIELD = "Name";
const WATCHED_FIELD = "Status";
const IGNORED_FIELD = "Notes";
const CHANGED_FIELD = "Last changed";

export const runTrackedModifiedSortCase = async (
  bugCase: BugCaseFor<"tracked-modified-sort">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TrackedModifiedSortCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.rowNames.length < 3) {
    throw new Error(
      "three rows at least - with two, an order that is reversed and an order that is wrong in one place look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: WATCHED_FIELD, type: FieldType.SingleLineText },
        { name: IGNORED_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rowNames.map((name) => ({
        fields: { [NAME_FIELD]: name },
      })),
    });
    tableId = table.id;
    const rowIds = (table.records ?? []).map(
      (record: { id: string }) => record.id,
    );
    const watchedId = table.fields.find(
      (field: { name: string }) => field.name === WATCHED_FIELD,
    )?.id;
    const ignoredId = table.fields.find(
      (field: { name: string }) => field.name === IGNORED_FIELD,
    )?.id;
    if (!watchedId || !ignoredId || rowIds.length !== config.rowNames.length) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // The column, narrowed to one column it watches.
    const changed = await createField(tableId, {
      name: CHANGED_FIELD,
      type: FieldType.LastModifiedTime,
      options: {
        trackedFieldIds: [watchedId],
        formatting: {
          date: DateFormattingPreset.ISO,
          time: TimeFormatting.Hour24,
          timeZone: "UTC",
        },
      },
    });

    // Touch the watched column one row at a time, oldest first, waiting
    // between each so the stored times are distinguishable at the second.
    for (let index = 0; index < rowIds.length; index += 1) {
      await apiUpdateRecord(tableId, rowIds[index], {
        fieldKeyType: FieldKeyType.Id,
        record: { fields: { [watchedId]: `state-${index}` } },
      });
      await new Promise((resolve) => setTimeout(resolve, config.stepMs));
    }
    // Then edit a column the "last changed" column is NOT watching, on the row
    // whose watched value is the oldest. This is the whole fixture: the row
    // most recently touched and the row most recently touched *in a way that
    // counts* are now different rows.
    await apiUpdateRecord(tableId, rowIds[0], {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [ignoredId]: "tidied up afterwards" } },
    });

    const readRows = async (sorted: boolean) => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: rowIds.length,
        ...(sorted
          ? {
              orderBy: [{ fieldId: changed.id, order: SortFunc.Desc }],
            }
          : {}),
      });
      return response;
    };

    // Fixture verification, outside the checkpoint: the column shows three
    // different times, and the newest belongs to the row whose watched column
    // was touched last. Without both, the sort would have nothing to
    // contradict.
    const unsorted = await readRows(false);
    const shownById = new Map<string, string>(
      unsorted.data.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          record.id,
          String(record.fields[changed.id] ?? ""),
        ],
      ),
    );
    const shown = rowIds.map((id) => shownById.get(id) ?? "");
    if (shown.some((value) => value === "")) {
      throw new Error(
        `the last-changed column is empty on some rows: ${JSON.stringify(shown)}`,
      );
    }
    if (new Set(shown).size !== shown.length) {
      throw new Error(
        `the last-changed column shows the same time on more than one row: ${JSON.stringify(shown)} - ` +
          "the rows were edited too close together to tell apart",
      );
    }
    const newestShown = [...shown].sort().at(-1);
    if (newestShown !== shown[shown.length - 1]) {
      throw new Error(
        `the newest shown time belongs to the wrong row: ${JSON.stringify(shown)} - ` +
          "the column is not being narrowed to the column it was told to watch",
      );
    }

    const probe = await bugCheckpoint(
      "sorting-by-last-changed-follows-what-it-shows",
      async () => {
        const sorted = await readRows(true);
        const routing = assertServedByV2(sorted.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const order = sorted.data.records.map(
          (record: { id: string }) => record.id,
        );
        const expected = [...rowIds].sort((left, right) =>
          (shownById.get(right) ?? "").localeCompare(shownById.get(left) ?? ""),
        );
        if (order.join(" ") !== expected.join(" ")) {
          const asNames = (ids: string[]) =>
            ids.map(
              (id) =>
                `${config.rowNames[rowIds.indexOf(id)]}(${shownById.get(id)})`,
            );
          throw new Error(
            `sorting by the last-changed column put the rows in ${JSON.stringify(asNames(order))}, ` +
              `but the column itself shows ${JSON.stringify(asNames(expected))} - ` +
              "the row at the top is not the one showing the latest time",
          );
        }
        return { routing, order };
      },
    );

    return {
      details: {
        tableId,
        shown,
        sortedOrder: probe.order,
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
