import {
  FieldKeyType,
  FieldType,
  GroupPointType,
  SortFunc,
} from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ProjectedGroupHeadersCaseConfig } from "../types";

// A grouped view -> ask for it with only some of its columns, the way the grid
// asks when the rest are scrolled out of sight -> checkpoint: the group
// headings still come back.
//
// A grouped table is mostly its headings. They carry the value each group is
// for and how many rows are in it, and on a table of any size they are the
// only part a person reads before deciding where to scroll.
//
// Asking for a narrowed set of columns dropped them. Not the rows - the rows
// arrive - just the headings and their counts, so the grouped table arrives as
// a flat list with no way to tell where one group ends. Which columns happen
// to be on screen is not something a person chooses or notices, so the same
// table looks grouped or ungrouped depending on where they had scrolled.
//
// The unnarrowed read is taken first and outside the checkpoint: it is what
// says the grouping exists at all, so the narrowed read has something to be
// missing.

const NAME_FIELD = "Name";
const GROUP_FIELD = "Status";
const OTHER_FIELD = "Notes";

export const runProjectedGroupHeadersCase = async (
  bugCase: BugCaseFor<"projected-group-headers">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ProjectedGroupHeadersCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (new Set(config.rowStatuses).size < 2) {
    throw new Error(
      "two different statuses at least - with one, a grouping that collapsed to a single heading and a correct one look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: GROUP_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [...new Set(config.rowStatuses)].map((status) => ({
              name: status,
            })),
          },
        },
        { name: OTHER_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rowStatuses.map((status, index) => ({
        fields: {
          [NAME_FIELD]: `row-${index}`,
          [GROUP_FIELD]: status,
          [OTHER_FIELD]: `note-${index}`,
        },
      })),
    });
    tableId = table.id;
    const groupFieldId = table.fields.find(
      (field: { name: string }) => field.name === GROUP_FIELD,
    )?.id;
    const viewId = table.views?.[0]?.id;
    if (!groupFieldId || !viewId) {
      throw new Error(`Table ${tableId} is not in place`);
    }
    const groupBy = [{ fieldId: groupFieldId, order: SortFunc.Asc }];
    const expectedGroups = new Set(config.rowStatuses).size;

    const headerCount = (extra: unknown): number =>
      (
        ((extra as { groupPoints?: { type: number }[] })?.groupPoints ??
          []) as {
          type: number;
        }[]
      ).filter((point) => point.type === GroupPointType.Header).length;

    // Fixture verification, outside the checkpoint: asked for everything, the
    // view is grouped and has the headings the fixture declares. Without this
    // the checkpoint could not tell a dropped heading from a table that was
    // never grouped.
    const whole = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      viewId,
      groupBy,
      take: config.rowStatuses.length,
    });
    const wholeHeaders = headerCount(whole.data.extra);
    if (wholeHeaders !== expectedGroups) {
      throw new Error(
        `asked for every column, the view comes back with ${wholeHeaders} group headings, expected ${expectedGroups} - the fixture is not grouped as declared`,
      );
    }

    const probe = await bugCheckpoint(
      "a-narrowed-read-still-carries-the-group-headings",
      async () => {
        // Only the column being grouped by - the narrowest thing the grid
        // asks for, and the shape that lost the headings.
        const narrowed = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId,
          groupBy,
          projection: [groupFieldId],
          take: config.rowStatuses.length,
        });
        const routing = assertServedByV2(narrowed.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        if (narrowed.data.records.length !== config.rowStatuses.length) {
          throw new Error(
            `the narrowed read returned ${narrowed.data.records.length} rows, expected ${config.rowStatuses.length} - the rows are what is missing, not the headings`,
          );
        }
        const headers = headerCount(narrowed.data.extra);
        if (headers !== expectedGroups) {
          throw new Error(
            `asking for one column instead of all three left the view with ${headers} group headings, expected ${expectedGroups} - ` +
              "the rows arrive and the grouping does not, so the table reads as a flat list",
          );
        }
        return { routing, headers };
      },
    );

    return {
      details: {
        tableId,
        rows: config.rowStatuses.length,
        expectedGroups,
        headersWhenNarrowed: probe.headers,
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
