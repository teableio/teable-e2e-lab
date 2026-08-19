import {
  FieldKeyType,
  FieldType,
  Relationship,
  SortFunc,
  isNoneOf,
  isNotEmpty,
} from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateViewGroup,
  updateViewSort,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  getRecords,
  getViews,
  permanentDeleteTable,
  updateViewFilter,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupFilterViewCaseConfig } from "../types";

// Build a reference table with a single-select -> link a host table to it ->
// look that select up on the host -> save a view that filters, sorts and
// groups on the lookup -> checkpoint: the view loads and returns exactly the
// rows the filter describes.
//
// The lookup is the whole point. A scalar lookup is stored as a plain scalar
// while the filter path treated it as the JSON array a multi-value lookup
// would be, so an isNoneOf on it built a comparison between text and jsonb
// that Postgres refuses. The user never sees a filter error - the table just
// stops loading records - which is why the checkpoint asks for the rows rather
// than for the filter's own status code.
//
// Filter, sort and group all point at the same lookup on purpose: they are
// three separate consumers of the same expression, and the customer's saved
// view had all three.

const REFERENCE_NAME_FIELD = "Reference";
const CATEGORY_FIELD = "Category";
const TASK_FIELD = "Task";
const LINK_FIELD = "Reference";
const LOOKUP_FIELD = "Reference Category";

export const runLookupFilterViewCase = async (
  bugCase: BugCaseFor<"lookup-filter-view">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupFilterViewCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let referenceTableId = "";
  let hostTableId = "";

  const categories = [config.allowedCategory, ...config.excludedCategories];
  const linkedCategories = config.rows
    .map((row) => row.category)
    .filter((category): category is string => category !== null);
  const unknown = linkedCategories.filter(
    (category) => !categories.includes(category),
  );
  if (unknown.length > 0) {
    throw new Error(
      `rows reference categories that do not exist: [${unknown.join(", ")}] - the case cannot run`,
    );
  }

  try {
    const referenceTable = await createTable(baseId, {
      name: `${suffix}-reference`,
      fields: [
        { name: REFERENCE_NAME_FIELD, type: FieldType.SingleLineText },
        {
          name: CATEGORY_FIELD,
          type: FieldType.SingleSelect,
          options: { choices: categories.map((name) => ({ name })) },
        },
      ],
      // One reference row per category, named after it, so a row's category is
      // readable straight off the link without a second lookup by the reader.
      records: categories.map((category) => ({
        fields: {
          [REFERENCE_NAME_FIELD]: category,
          [CATEGORY_FIELD]: category,
        },
      })),
    });
    referenceTableId = referenceTable.id;
    const categoryField = referenceTable.fields.find(
      (field: { name: string }) => field.name === CATEGORY_FIELD,
    );
    if (!categoryField) {
      throw new Error(`Reference table ${referenceTableId} has no category`);
    }
    const referenceIdByCategory = new Map<string, string>(
      referenceTable.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[CATEGORY_FIELD]),
          record.id,
        ],
      ),
    );

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: TASK_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    hostTableId = hostTable.id;

    const withLink = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: referenceTableId,
        relationship: Relationship.ManyOne,
      },
    });
    const withLookup = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleSelect,
      isLookup: true,
      lookupOptions: {
        foreignTableId: referenceTableId,
        lookupFieldId: categoryField.id,
        linkFieldId: withLink.id,
      },
    });

    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: config.rows.map((row) => ({
        fields: {
          [TASK_FIELD]: row.task,
          ...(row.category === null
            ? {}
            : {
                [LINK_FIELD]: { id: referenceIdByCategory.get(row.category) },
              }),
        },
      })),
    });

    const view = (await getViews(hostTableId))[0];
    if (!view) {
      throw new Error(`Table ${hostTableId} has no default view`);
    }

    // Fixture verification, outside the checkpoint: before the view is saved
    // the host table must read back every row with the lookup already resolved.
    // The failure below is "the view will not load"; if the plain table cannot
    // load either, that is a different fault and must not be read as this bug.
    // Read through the openapi client rather than the init-app wrapper: the
    // wrapper returns .data, and the routing proof lives in the headers of
    // this exact response - the read whose SQL the bug breaks.
    const seededResponse = await apiGetRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rows.length,
    });
    const routing = assertServedByV2(seededResponse.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const seeded = seededResponse.data;
    if (seeded.records.length !== config.rows.length) {
      throw new Error(
        `Seed did not land: read back ${seeded.records.length} rows, expected ${config.rows.length}`,
      );
    }
    const unresolved = config.rows
      .filter((row) => row.category !== null)
      .filter((row) => {
        const record = seeded.records.find(
          (candidate: { fields: Record<string, unknown> }) =>
            candidate.fields[TASK_FIELD] === row.task,
        );
        return record?.fields[LOOKUP_FIELD] !== row.category;
      })
      .map((row) => row.task);
    if (unresolved.length > 0) {
      throw new Error(
        `Lookup did not resolve for [${unresolved.join(", ")}] - the fixture is not in place`,
      );
    }

    const taskField = hostTable.fields.find(
      (field: { name: string }) => field.name === TASK_FIELD,
    );
    if (!taskField) {
      throw new Error(`Table ${hostTableId} has no ${TASK_FIELD} field`);
    }

    const probe = await bugCheckpoint("saved-lookup-view-loads", async () => {
      await updateViewFilter(hostTableId, view.id, {
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: withLookup.id,
              operator: isNotEmpty.value,
              value: null,
            },
            {
              fieldId: withLookup.id,
              operator: isNoneOf.value,
              value: config.excludedCategories,
            },
          ],
        },
      });
      await updateViewSort(hostTableId, view.id, {
        sort: {
          sortObjs: [
            { fieldId: withLookup.id, order: SortFunc.Asc },
            { fieldId: taskField.id, order: SortFunc.Asc },
          ],
          manualSort: false,
        },
      });
      await updateViewGroup(hostTableId, view.id, {
        group: [{ fieldId: withLookup.id, order: SortFunc.Asc }],
      });

      // The bug surfaces here as a 500, which bugCheckpoint already counts as
      // a reproduction; the row comparison below catches the quieter shape
      // where the view loads but the lookup filter matched the wrong rows.
      const loaded = await getRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        viewId: view.id,
        take: config.rows.length,
      });
      const tasks = loaded.records.map(
        (record: { fields: Record<string, unknown> }) =>
          String(record.fields[TASK_FIELD]),
      );
      if (tasks.join(" ") !== config.expectedTasks.join(" ")) {
        throw new Error(
          `the saved view returned [${tasks.join(", ")}], expected [${config.expectedTasks.join(", ")}]`,
        );
      }
      return { tasks };
    });

    return {
      details: {
        referenceTableId,
        hostTableId,
        routing,
        allowedCategory: config.allowedCategory,
        excludedCategories: config.excludedCategories,
        expectedTasks: config.expectedTasks,
        returnedTasks: probe.tasks,
      },
    };
  } finally {
    for (const tableId of [hostTableId, referenceTableId]) {
      if (!tableId) {
        continue;
      }
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
