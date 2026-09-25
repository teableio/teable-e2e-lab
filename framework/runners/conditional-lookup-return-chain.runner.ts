import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertHybridComputedRuntime, assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ConditionalLookupReturnChainCaseConfig } from "../types";

// Stock issued from a summary row: the summary links the detail rows that
// drew on it, totals what they drew, and works out what is left. Every detail
// row looks the "left" figure back up by key -> record draws of 5, then 2,
// then 3 -> checkpoint: after each one, every detail row shows what is left
// now.
//
// The summary moved on at once: 195, then 193, then 190. The detail rows
// showed the figure from one draw earlier - 200 while the summary said 195,
// 195 while it said 193 - always one round behind, so whoever entered a draw
// saw the stock it had before they entered it. The work that refreshes the
// detail rows was scheduled ahead of the work that computes the figure they
// read, when the two tables' updates ran in the background.
//
// Only under the production computed-update strategy, and at a size where the
// detail rows' refresh is not done inside the write: the report's table held
// about 2000 detail rows, which is what this case uses.

const KEY_FIELD = "Key";
const AMOUNT_FIELD = "Amount";
const TOTAL_FIELD = "Total";
const LINK_FIELD = "Details";
const USED_FIELD = "Used";
const REMAINING_FIELD = "Remaining";
const DOWNSTREAM_FIELD = "Remaining downstream";
const LOOKUP_FIELD = "Remaining by key";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runConditionalLookupReturnChainCase = async (
  bugCase: BugCaseFor<"conditional-lookup-return-chain">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalLookupReturnChainCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  assertHybridComputedRuntime(bugCase.id);
  if (config.draws.length > config.linkedCount) {
    throw new Error("one linked detail row per draw");
  }

  try {
    const detail = await createTable(baseId, {
      name: `${suffix}-detail`,
      fields: [
        { name: KEY_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: [],
    });
    createdTableIds.unshift(detail.id);
    const detailKeyId = detail.fields.find(
      (field: { name: string }) => field.name === KEY_FIELD,
    )?.id as string;
    const amountId = detail.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;
    const detailIds: string[] = [];
    for (
      let offset = 0;
      offset < config.detailCount;
      offset += config.seedBatchSize
    ) {
      const size = Math.min(config.seedBatchSize, config.detailCount - offset);
      const created = await apiCreateRecords(detail.id, {
        fieldKeyType: FieldKeyType.Id,
        typecast: false,
        records: Array.from({ length: size }, () => ({
          fields: { [detailKeyId]: config.key, [amountId]: 0 },
        })),
      });
      detailIds.push(
        ...created.data.records.map((record: { id: string }) => record.id),
      );
    }

    const summary = await createTable(baseId, {
      name: `${suffix}-summary`,
      fields: [
        { name: KEY_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: TOTAL_FIELD, type: FieldType.Number },
      ],
      records: [],
    });
    createdTableIds.unshift(summary.id);
    const summaryKeyId = summary.fields.find(
      (field: { name: string }) => field.name === KEY_FIELD,
    )?.id as string;
    const totalId = summary.fields.find(
      (field: { name: string }) => field.name === TOTAL_FIELD,
    )?.id as string;
    const link = await createField(summary.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: detail.id,
      },
    });
    const used = await createField(summary.id, {
      name: USED_FIELD,
      type: FieldType.Rollup,
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: detail.id,
        linkFieldId: link.id,
        lookupFieldId: amountId,
      },
    });
    const remaining = await createField(summary.id, {
      name: REMAINING_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${totalId}} - {${used.id}}` },
    });
    const downstream = await createField(summary.id, {
      name: DOWNSTREAM_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${remaining.id}} + 0` },
    });
    const summaryRow = await apiCreateRecords(summary.id, {
      fieldKeyType: FieldKeyType.Id,
      typecast: false,
      records: [
        {
          fields: {
            [summaryKeyId]: config.key,
            [totalId]: config.total,
            [link.id]: detailIds
              .slice(0, config.linkedCount)
              .map((id) => ({ id })),
          },
        },
      ],
    });
    const summaryId = summaryRow.data.records[0]?.id as string;

    const lookup = await createField(detail.id, {
      name: LOOKUP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      isConditionalLookup: true,
      lookupOptions: {
        foreignTableId: summary.id,
        lookupFieldId: remaining.id,
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: summaryKeyId,
              operator: "is",
              value: { type: "field", fieldId: detailKeyId },
            },
          ],
        },
      },
    });

    // Everything a draw has to reach: the summary's three figures, and the
    // looked-up figure on every detail row.
    const readState = async () => {
      const summaryRead = await apiGetRecords(summary.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 2,
      });
      const fields = (summaryRead.data.records.find(
        (record: { id: string }) => record.id === summaryId,
      )?.fields ?? {}) as Record<string, unknown>;
      const counts = new Map<string, number>();
      for (
        let skip = 0;
        skip < config.detailCount;
        skip += config.readPageSize
      ) {
        const page = await apiGetRecords(detail.id, {
          fieldKeyType: FieldKeyType.Id,
          take: config.readPageSize,
          skip,
        });
        for (const record of page.data.records as {
          fields: Record<string, unknown>;
        }[]) {
          const key = JSON.stringify(record.fields[lookup.id] ?? null);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      return {
        headers: summaryRead.headers,
        summary: {
          used: fields[used.id] ?? null,
          remaining: fields[remaining.id] ?? null,
          downstream: fields[downstream.id] ?? null,
        },
        detailLookups: Object.fromEntries(counts),
      };
    };
    const settledAt = (
      state: Awaited<ReturnType<typeof readState>>,
      left: number,
    ) =>
      state.summary.used === config.total - left &&
      state.summary.remaining === left &&
      state.summary.downstream === left &&
      JSON.stringify(state.detailLookups) ===
        JSON.stringify({ [JSON.stringify([left])]: config.detailCount });
    const waitFor = async (left: number) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let state = await readState();
      while (!settledAt(state, left) && Date.now() < deadline) {
        await sleep(config.pollIntervalMs);
        state = await readState();
      }
      return { settled: settledAt(state, left), state };
    };

    // Fixture verification, outside the checkpoint: before any draw, the
    // summary says the whole total is left and every detail row shows it.
    const start = await waitFor(config.total);
    const routing = assertServedByV2(start.state.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (!start.settled) {
      throw new Error(
        `before any draw, the state reads ${JSON.stringify({ summary: start.state.summary, detailLookups: start.state.detailLookups })}, ` +
          `expected ${config.total} left everywhere - the fixture did not settle`,
      );
    }

    const probe = await bugCheckpoint(
      "every-detail-row-shows-what-is-left-after-each-draw",
      async () => {
        const steps: unknown[] = [];
        let left = config.total;
        for (const [index, draw] of config.draws.entries()) {
          await apiUpdateRecord(detail.id, detailIds[index] as string, {
            fieldKeyType: FieldKeyType.Id,
            record: { fields: { [amountId]: draw } },
          });
          left -= draw;
          const result = await waitFor(left);
          steps.push({ draw, left, ...result.state, headers: undefined });
          if (!result.settled) {
            throw new Error(
              `after drawing ${draw}, ${left} should be left; after ${config.settleTimeoutMs}ms the summary reads ` +
                `${JSON.stringify(result.state.summary)} and the detail rows' looked-up figure reads ` +
                `${JSON.stringify(result.state.detailLookups)} (value: rows) - steps so far ${JSON.stringify(steps)}`,
            );
          }
        }
        return { steps };
      },
    );

    return {
      details: { tableIds: createdTableIds, routing, steps: probe.steps },
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
