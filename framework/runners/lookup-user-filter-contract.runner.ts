import { FieldKeyType, FieldType, hasAnyOf, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
  updateViewFilter as apiUpdateViewFilter,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  LookupUserFilterContractCaseConfig,
} from "../types";

const TITLE_FIELD = "Title";
const USER_FIELD = "Owner";

export const runLookupUserFilterContractCase = async (
  bugCase: BugCaseFor<"lookup-user-filter-contract">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupUserFilterContractCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];

  try {
    const source = await createTable(baseId, {
      name: `${suffix}-owners`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: USER_FIELD,
          type: FieldType.User,
          options: { isMultiple: false, shouldNotify: false },
        },
      ],
      records: [],
    });
    tableIds.unshift(source.id);
    const ownerField = source.fields.find((field) => field.name === USER_FIELD);
    if (!ownerField) {
      throw new Error("the source user field is missing");
    }
    const sourceRows = await apiCreateRecords(source.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [source.fields[0].id]: "current-owner",
            [ownerField.id]: {
              id: globalThis.testConfig.userId,
              title: globalThis.testConfig.userName,
            },
          },
        },
      ],
    });
    const sourceRecordId = sourceRows.data.records[0]?.id;
    if (!sourceRecordId) {
      throw new Error("the source owner row did not land");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-work`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [TITLE_FIELD]: config.matchedTitle } },
        { fields: { [TITLE_FIELD]: config.unmatchedTitle } },
      ],
    });
    tableIds.unshift(host.id);
    const matchedRecordId = host.records?.[0]?.id;
    const unmatchedRecordId = host.records?.[1]?.id;
    const viewId = host.views?.[0]?.id;
    if (!matchedRecordId || !unmatchedRecordId || !viewId) {
      throw new Error("the host rows or default view are missing");
    }

    const link = await createField(host.id, {
      name: "Owners",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: source.id,
      },
    });
    await apiUpdateRecord(host.id, matchedRecordId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [link.id]: [{ id: sourceRecordId }] } },
    });
    const lookup = await createField(host.id, {
      name: "Owner Lookup",
      type: FieldType.User,
      isLookup: true,
      lookupOptions: {
        foreignTableId: source.id,
        linkFieldId: link.id,
        lookupFieldId: ownerField.id,
      },
    });

    const unfiltered = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      viewId,
      take: 2,
    });
    const routing = assertServedByV2(unfiltered.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (unfiltered.data.records.length !== 2) {
      throw new Error("the unfiltered view does not contain both host rows");
    }
    const linkedCell = unfiltered.data.records.find(
      (record) => record.id === matchedRecordId,
    )?.fields[link.id];
    if (!Array.isArray(linkedCell) || linkedCell.length !== 1) {
      throw new Error("the matching host row is not linked to its owner row");
    }

    const filter = {
      conjunction: "and" as const,
      filterSet: [
        {
          fieldId: lookup.id,
          operator: hasAnyOf.value,
          value: [globalThis.testConfig.userId],
        },
      ],
    };
    const probe = await bugCheckpoint(
      "multi-user-lookup-accepts-and-applies-a-multi-value-filter",
      async () => {
        const described = await getField(host.id, lookup.id);
        if (described.isMultipleCellValue !== true) {
          throw new Error(
            `the one-to-many user lookup is described as isMultipleCellValue=${JSON.stringify(described.isMultipleCellValue)}, expected true`,
          );
        }

        const saved = await apiUpdateViewFilter(host.id, viewId, { filter });
        const saveRouting = assertServedByV2(saved.headers, {
          operation: "PUT /table/{tableId}/view/{viewId}/filter",
          feature: "updateViewFilter",
        });
        const filtered = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Id,
          viewId,
          take: 2,
        });
        const readRouting = assertServedByV2(filtered.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const ids = filtered.data.records.map((record) => record.id);
        if (ids.length !== 1 || ids[0] !== matchedRecordId) {
          throw new Error(
            `the multi-value user filter returned ${JSON.stringify(ids)}, expected only ${matchedRecordId}`,
          );
        }
        return { saveRouting, readRouting, ids };
      },
    );

    return {
      details: {
        sourceTableId: source.id,
        hostTableId: host.id,
        matchedRecordId,
        unmatchedRecordId,
        returnedRecordIds: probe.ids,
        routing,
        saveRouting: probe.saveRouting,
        readRouting: probe.readRouting,
      },
    };
  } finally {
    for (const tableId of tableIds) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
};
