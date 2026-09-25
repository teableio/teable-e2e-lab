import { FieldKeyType, FieldType, Relationship, SortFunc } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
  updateViewGroup as apiUpdateViewGroup,
  GroupPointType,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupLinkGroupOrderCaseConfig } from "../types";

// Labels -> sources that link to labels -> a main table that borrows each
// source's link to its labels -> group the main table by that borrowed link,
// ascending -> checkpoint: the group headings come in the order of the titles
// they show.
//
// Grouped by the borrowed link, "kids" came before "0kids HQ": the groups
// were ordered by what is stored for a link - the linked row's id - not by
// the title on the heading. Grouping by the source's own link column ordered
// them by title, so the same labels sorted two different ways a click apart.
//
// Record ids are random, so the case gives the titles out after the labels
// exist: the label with the smaller id gets the title that sorts later. An
// order by id and an order by title then disagree on every run.
//
// The grouping is saved on the view, as in the report, and the page reads the
// view with no sort of its own - the grouping is the only thing ordering the
// rows. Two rows per label, added interleaved, so rows that are not gathered
// under their heading cannot pass on the order they were added in.

const TITLE_FIELD = "Title";
const NAME_FIELD = "Name";
const LABELS_LINK_FIELD = "Labels";
const SOURCES_LINK_FIELD = "Sources";
const BORROWED_FIELD = "Borrowed labels";

type HeaderPoint = {
  type: number;
  id: string;
  depth?: number;
  value?: unknown;
};

const titleOf = (value: unknown): string => {
  const first = Array.isArray(value) ? value[0] : value;
  if (first && typeof first === "object" && "title" in first) {
    return String((first as { title?: unknown }).title ?? "");
  }
  return first == null ? "" : String(first);
};

export const runLookupLinkGroupOrderCase = async (
  bugCase: BugCaseFor<"lookup-link-group-order">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupLinkGroupOrderCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  const [earlyTitle, lateTitle] = [...config.titles].sort((left, right) =>
    left.localeCompare(right),
  ) as [string, string];
  if (config.titles.length !== 2 || earlyTitle === lateTitle) {
    throw new Error("two different titles - one to sort first, one later");
  }

  try {
    const labels = await createTable(baseId, {
      name: `${suffix}-labels`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [TITLE_FIELD]: "pending-1" } },
        { fields: { [TITLE_FIELD]: "pending-2" } },
      ],
    });
    createdTableIds.unshift(labels.id);
    const titleFieldId = labels.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    )?.id as string;
    // The smaller id gets the title that sorts later.
    const [smallerId, largerId] = labels.records
      .map((record: { id: string }) => record.id)
      .sort() as [string, string];
    await apiUpdateRecord(labels.id, smallerId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [titleFieldId]: lateTitle } },
    });
    await apiUpdateRecord(labels.id, largerId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [titleFieldId]: earlyTitle } },
    });

    const sources = await createTable(baseId, {
      name: `${suffix}-sources`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(sources.id);
    const labelsLink = await createField(sources.id, {
      name: LABELS_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: labels.id,
      },
    });
    const sourceRows = await apiCreateRecords(sources.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: "source-late",
            [LABELS_LINK_FIELD]: [{ id: smallerId }],
          },
        },
        {
          fields: {
            [NAME_FIELD]: "source-early",
            [LABELS_LINK_FIELD]: [{ id: largerId }],
          },
        },
      ],
    });
    const sourceIds = sourceRows.data.records.map(
      (record: { id: string }) => record.id,
    ) as [string, string];

    const main = await createTable(baseId, {
      name: `${suffix}-main`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(main.id);
    const sourcesLink = await createField(main.id, {
      name: SOURCES_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: sources.id,
      },
    });
    const borrowed = await createField(main.id, {
      name: BORROWED_FIELD,
      type: FieldType.Link,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sources.id,
        linkFieldId: sourcesLink.id,
        lookupFieldId: labelsLink.id,
      },
    });
    // Late, early, late, early.
    const [lateSource, earlySource] = sourceIds;
    await apiCreateRecords(main.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        { name: "late-1", source: lateSource },
        { name: "early-1", source: earlySource },
        { name: "late-2", source: lateSource },
        { name: "early-2", source: earlySource },
      ].map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [SOURCES_LINK_FIELD]: [{ id: row.source }],
        },
      })),
    });
    const nameFieldId = main.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id as string;
    const viewId = main.views?.[0]?.id as string;
    await apiUpdateViewGroup(main.id, viewId, {
      group: [{ fieldId: borrowed.id, order: SortFunc.Asc }],
    });

    const readGrouped = async () =>
      apiGetRecords(main.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 10,
        viewId,
      });

    // Fixture verification, outside the checkpoint: every main row borrowed
    // its label, and there are two headings, one per title.
    const first = await readGrouped();
    const routing = assertServedByV2(first.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const borrowedTitles = first.data.records
      .map((record: { fields: Record<string, unknown> }) =>
        titleOf(record.fields[borrowed.id]),
      )
      .sort();
    if (
      JSON.stringify(borrowedTitles) !==
      JSON.stringify([earlyTitle, earlyTitle, lateTitle, lateTitle].sort())
    ) {
      throw new Error(
        `the main rows borrowed ${JSON.stringify(borrowedTitles)}, expected two each of ` +
          `${JSON.stringify([earlyTitle, lateTitle])} - the fixture is not in place`,
      );
    }
    const headersOf = (response: typeof first) =>
      (
        ((response.data.extra as { groupPoints?: HeaderPoint[] })
          ?.groupPoints ?? []) as HeaderPoint[]
      ).filter((point) => point.type === GroupPointType.Header);
    if (headersOf(first).length !== 2) {
      throw new Error(
        `grouping by the borrowed link gave ${headersOf(first).length} headings, expected 2`,
      );
    }

    const probe = await bugCheckpoint(
      "groups-on-a-borrowed-link-follow-their-titles",
      async () => {
        const grouped = await readGrouped();
        const order = headersOf(grouped).map((header) => titleOf(header.value));
        const rows = grouped.data.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[nameFieldId]),
        );
        const expectedRows = ["early-1", "early-2", "late-1", "late-2"];
        if (
          JSON.stringify(order) !== JSON.stringify([earlyTitle, lateTitle]) ||
          JSON.stringify(rows) !== JSON.stringify(expectedRows)
        ) {
          throw new Error(
            `grouped ascending by the borrowed link, the headings read ${JSON.stringify(order)}, ` +
              `expected ${JSON.stringify([earlyTitle, lateTitle])}; the rows came back ${JSON.stringify(rows)}, ` +
              `expected ${JSON.stringify(expectedRows)} - the view is not ordered by the ` +
              `titles they show (the label titled ${JSON.stringify(lateTitle)} has the smaller record id)`,
          );
        }
        return { order, rows };
      },
    );

    return {
      details: {
        tableIds: createdTableIds,
        routing,
        headings: probe.order,
        rows: probe.rows,
      },
    };
  } finally {
    for (const tableId of createdTableIds) {
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
