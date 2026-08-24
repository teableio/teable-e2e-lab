import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  TimeFormatting,
  is,
} from "@teable/core";
import {
  getRecords as apiGetRecords,
  getRowCount,
  updateViewFilter as apiUpdateViewFilter,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2, pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { MixedFieldSearchViewFilterCaseConfig } from "../types";

const NAME_FIELD = "Name";
const CATEGORY_FIELD = "Category";
const DATE_FIELD = "ShipDate";

const recordNames = (records: { fields: Record<string, unknown> }[]) =>
  records.map((record) => String(record.fields[NAME_FIELD] ?? "")).sort();

const assertNames = (actual: string[], expected: string[], context: string) => {
  const sortedExpected = [...expected].sort();
  if (actual.join("\n") !== sortedExpected.join("\n")) {
    throw new Error(
      `${context} returned [${actual.join(", ")}], expected [${sortedExpected.join(", ")}]`,
    );
  }
};

export const runMixedFieldSearchViewFilterCase = async (
  bugCase: BugCaseFor<"mixed-field-search-view-filter">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: MixedFieldSearchViewFilterCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const titles = [
    config.expectedRowTitle,
    config.sameDateOutsideViewTitle,
    config.otherDateRowTitle,
  ];
  if (new Set(titles).size !== titles.length) {
    throw new Error("the three Y164 fixture row titles must be distinct");
  }
  if (
    titles.some((title) => title.includes(config.searchTerm)) ||
    config.targetDate.slice(0, 10) !== config.searchTerm ||
    config.otherDate.slice(0, 10) === config.searchTerm
  ) {
    throw new Error(
      "the Y164 fixture must match the search through the target date only, with distinct text and other-date controls",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CATEGORY_FIELD, type: FieldType.SingleLineText },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.expectedRowTitle,
            [CATEGORY_FIELD]: config.keptCategory,
            [DATE_FIELD]: config.targetDate,
          },
        },
        {
          fields: {
            [NAME_FIELD]: config.sameDateOutsideViewTitle,
            [CATEGORY_FIELD]: config.droppedCategory,
            [DATE_FIELD]: config.targetDate,
          },
        },
        {
          fields: {
            [NAME_FIELD]: config.otherDateRowTitle,
            [CATEGORY_FIELD]: config.keptCategory,
            [DATE_FIELD]: config.otherDate,
          },
        },
      ],
    });
    tableId = table.id;

    const viewId = table.defaultViewId;
    const nameFieldId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id;
    const categoryFieldId = table.fields.find(
      (field: { name: string }) => field.name === CATEGORY_FIELD,
    )?.id;
    const dateFieldId = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    if (!viewId || !nameFieldId || !categoryFieldId || !dateFieldId) {
      throw new Error(`Table ${tableId} is missing its fixture view or fields`);
    }

    const filter = {
      conjunction: "and" as const,
      filterSet: [
        {
          fieldId: dateFieldId,
          operator: is.value,
          value: {
            mode: "exactDate",
            exactDate: `${config.searchTerm}T00:00:00.000Z`,
            timeZone: config.timeZone,
          },
        },
        {
          fieldId: categoryFieldId,
          operator: is.value,
          value: config.keptCategory,
        },
      ],
    };
    const search: [string, string, boolean] = [
      config.searchTerm,
      `${nameFieldId},${dateFieldId}`,
      true,
    ];

    await apiUpdateViewFilter(tableId, viewId, { filter });

    // Fixture verification, outside the checkpoint: both saved filters are
    // active before search is introduced.
    const filteredView = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId,
      take: titles.length,
    });
    assertNames(
      recordNames(filteredView.data.records),
      [config.expectedRowTitle],
      "the saved two-condition view",
    );

    // The same search over the whole table must find the excluded same-day
    // row too. Otherwise the checkpoint cannot prove the view stopped a leak.
    const wholeTableSearch = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId,
      ignoreViewQuery: true,
      search,
      take: titles.length,
    });
    assertNames(
      recordNames(wholeTableSearch.data.records),
      [config.expectedRowTitle, config.sameDateOutsideViewTitle],
      "the whole-table multi-field search",
    );

    const probe = await bugCheckpoint(
      "multi-field-date-search-stays-inside-every-view-filter",
      async () => {
        const records = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          viewId,
          search,
          take: titles.length,
        });
        const routing = assertServedByV2(records.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const names = recordNames(records.data.records);
        assertNames(
          names,
          [config.expectedRowTitle],
          "the view-scoped multi-field search",
        );

        const counted = await getRowCount(tableId, { viewId, search });
        if (counted.data.rowCount !== 1) {
          throw new Error(
            `row-count returned ${counted.data.rowCount}, expected 1 for the View Filter AND field-search intersection`,
          );
        }

        return {
          names,
          rowCount: counted.data.rowCount,
          routing,
          rowCountRouting: pickRoutingHeaders(counted.headers),
        };
      },
    );

    return {
      details: {
        tableId,
        tableName,
        viewId,
        searchTerm: config.searchTerm,
        expectedNames: [config.expectedRowTitle],
        wholeTableNames: recordNames(wholeTableSearch.data.records),
        ...probe,
      },
    };
  } finally {
    if (tableId) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
