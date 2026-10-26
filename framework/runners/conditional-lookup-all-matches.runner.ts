import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ConditionalLookupAllMatchesCaseConfig,
} from "../types";

const NAME_FIELD = "Name";
const KEY_FIELD = "Match Key";
const VALUE_FIELD = "Value";
const LOOKUP_FIELD = "Matching Values";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export const runConditionalLookupAllMatchesCase = async (
  bugCase: BugCaseFor<"conditional-lookup-all-matches">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalLookupAllMatchesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];

  if (config.sourceValues.length < 2) {
    throw new Error("at least two matching source rows are required");
  }

  try {
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: KEY_FIELD, type: FieldType.Number },
        { name: VALUE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.sourceValues.map((value, index) => ({
        fields: {
          [NAME_FIELD]: `source-${index + 1}`,
          [KEY_FIELD]: config.matchKey,
          [VALUE_FIELD]: value,
        },
      })),
    });
    tableIds.unshift(source.id);

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: KEY_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: { [NAME_FIELD]: "host-row", [KEY_FIELD]: config.matchKey },
        },
      ],
    });
    tableIds.unshift(host.id);

    const sourceKey = source.fields.find((field) => field.name === KEY_FIELD);
    const sourceValue = source.fields.find(
      (field) => field.name === VALUE_FIELD,
    );
    const hostKey = host.fields.find((field) => field.name === KEY_FIELD);
    const hostRecordId = host.records?.[0]?.id;
    if (!sourceKey || !sourceValue || !hostKey || !hostRecordId) {
      throw new Error("the conditional lookup fixture is incomplete");
    }

    const lookup = await createField(host.id, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      isConditionalLookup: true,
      lookupOptions: {
        foreignTableId: source.id,
        lookupFieldId: sourceValue.id,
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: sourceKey.id,
              operator: "is",
              value: { type: "field", fieldId: hostKey.id },
            },
          ],
        },
      },
    });

    const sourceRead = await apiGetRecords(source.id, {
      fieldKeyType: FieldKeyType.Id,
      take: config.sourceValues.length,
    });
    const seededValues = sourceRead.data.records
      .map((record) => String(record.fields[sourceValue.id] ?? ""))
      .sort();
    const expectedValues = [...config.sourceValues].sort();
    if (JSON.stringify(seededValues) !== JSON.stringify(expectedValues)) {
      throw new Error(
        `the source rows contain ${JSON.stringify(seededValues)}, expected ${JSON.stringify(expectedValues)}`,
      );
    }

    const initialHostRead = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 1,
    });
    const routing = assertServedByV2(initialHostRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const seededHost = initialHostRead.data.records.find(
      (record) => record.id === hostRecordId,
    );
    if (seededHost?.fields[hostKey.id] !== config.matchKey) {
      throw new Error("the host match key did not land");
    }

    const probe = await bugCheckpoint(
      "conditional-lookup-returns-every-matching-value",
      async () => {
        const deadline = Date.now() + config.settleTimeoutMs;
        let observed: string[] = [];
        for (;;) {
          const response = await apiGetRecords(host.id, {
            fieldKeyType: FieldKeyType.Id,
            take: 1,
          });
          const cell = response.data.records.find(
            (record) => record.id === hostRecordId,
          )?.fields[lookup.id];
          observed = (Array.isArray(cell) ? cell : cell == null ? [] : [cell])
            .map(String)
            .sort();
          if (JSON.stringify(observed) === JSON.stringify(expectedValues)) {
            return { observed };
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `the conditional lookup returned ${JSON.stringify(observed)}, expected every matching value ${JSON.stringify(expectedValues)}`,
            );
          }
          await sleep(config.pollIntervalMs);
        }
      },
    );

    return {
      details: {
        sourceTableId: source.id,
        hostTableId: host.id,
        values: probe.observed,
        routing,
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
