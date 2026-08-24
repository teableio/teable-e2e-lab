import { Colors, FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  PASTE_URL,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { GroupedRangeOffsetCaseConfig } from "../types";

// A view grouped by a column -> paste into a row by its position on screen ->
// checkpoint: the row that changes is the one at that position.
//
// Grouping rearranges a table completely: the rows are the same rows, in an
// order that has nothing to do with how they were entered. That is the whole
// point of it, and it is how most people look at a table of any size.
//
// Operations addressed by position - paste, clear, delete a range - worked out
// which rows they meant without applying the grouping, so they counted from a
// different order than the screen shows. The value lands on a row nobody
// selected; the row that was selected is untouched; nothing reports an error.
//
// The case asserts which record changed, by name. Asserting by position could
// not see this at all, because position is exactly what the two sides disagree
// about.

const NAME_FIELD = "Name";
const GROUP_FIELD = "Store";

export const runGroupedRangeOffsetCase = async (
  bugCase: BugCaseFor<"grouped-range-offset">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: GroupedRangeOffsetCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const groups = [...new Set(config.rows.map((row) => row.group))];
  if (groups.length < 2) {
    throw new Error(
      "the rows have to fall into at least two groups, or grouping does not rearrange anything",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: GROUP_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: groups.map((name) => ({ name, color: Colors.Blue })),
          },
        },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [GROUP_FIELD]: row.group },
      })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const groupFieldId = table.fields.find(
      (field: { name: string }) => field.name === GROUP_FIELD,
    )?.id;
    const nameFieldIndex = table.fields.findIndex(
      (field: { name: string }) => field.name === NAME_FIELD,
    );
    if (!viewId || !groupFieldId || nameFieldIndex < 0) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Group the view. The rows were created in an order that interleaves the
    // groups, so grouping genuinely rearranges them.
    const grouped = await axios.put(
      `/table/${tableId}/view/${viewId}/group`,
      { group: [{ fieldId: groupFieldId, order: config.groupOrder }] },
      { validateStatus: () => true },
    );
    if (grouped.status < 200 || grouped.status >= 300) {
      throw new Error(
        `grouping the view answered ${grouped.status}: ${JSON.stringify(grouped.data)}`,
      );
    }

    const visibleOrder = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        viewId,
        take: config.rows.length,
      });
      return read.data.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => ({
          id: record.id,
          name: String(record.fields[NAME_FIELD] ?? ""),
        }),
      );
    };

    // Fixture verification, outside the checkpoint: grouping really did
    // rearrange the rows. If the grouped order matched the order they were
    // created in, both ways of counting would agree and the case would prove
    // nothing.
    const before = await visibleOrder();
    const created = config.rows.map((row) => row.name);
    if (before.map((row) => row.name).join(",") === created.join(",")) {
      throw new Error(
        `the grouped view shows ${JSON.stringify(before.map((row) => row.name))}, the same order the rows ` +
          "were created in - the fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-paste-in-a-grouped-view-lands-on-the-row-at-that-position",
      async () => {
        const target = before[config.pasteAtOffset];
        if (!target) {
          throw new Error(
            `the grouped view has no row at position ${config.pasteAtOffset}`,
          );
        }

        const response = await axios.patch(
          urlBuilder(PASTE_URL, { tableId }),
          {
            viewId,
            ranges: [
              [nameFieldIndex, config.pasteAtOffset],
              [nameFieldIndex, config.pasteAtOffset],
            ],
            content: config.pastedValue,
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `pasting into position ${config.pasteAtOffset} answered ${response.status}: ` +
              JSON.stringify(response.data),
          );
        }

        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId,
          take: config.rows.length,
        });
        const changed = after.data.records.filter(
          (record: { fields: Record<string, unknown> }) =>
            record.fields[NAME_FIELD] === config.pastedValue,
        );
        if (changed.length !== 1) {
          throw new Error(`pasting one cell changed ${changed.length} rows`);
        }
        if (changed[0].id !== target.id) {
          const wrong = before.find((row) => row.id === changed[0].id)?.name;
          throw new Error(
            `the paste went into ${JSON.stringify(wrong)}, not ${JSON.stringify(target.name)}, which is the ` +
              `row the grouped view shows at position ${config.pasteAtOffset} - the value lands on a row ` +
              "nobody selected and the selected row is untouched",
          );
        }
        return { target: target.name };
      },
    );

    return {
      details: {
        tableId,
        groupedOrder: before.map((row) => row.name),
        pastedInto: probe.target,
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
