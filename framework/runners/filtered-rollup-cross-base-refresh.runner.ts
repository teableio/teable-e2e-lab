import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createBase,
  createField,
  createTable,
  deleteBase,
  permanentDeleteBase,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FilteredRollupCrossBaseRefreshCaseConfig } from "../types";

// A narrowed total over linked rows, a column reading that total, and two
// columns in ANOTHER base reading those -> change the number underneath ->
// checkpoint: all four follow.
//
// This is one number written down in four places, which is what a chain of
// summaries is. The one at the far end - in another base - is the one somebody
// reports from, and it is the furthest from anything that would show it is
// stale: the source row says 15, the summary beside it says 15, and the report
// in the other base still says 10.
//
// The narrowed total is what makes it hard. A total with a condition on it was
// worked out one linked row at a time during an update, and a host with several
// such totals could run past the time a statement is allowed and be dropped -
// leaving every column downstream holding the number from before.
//
// The case asserts all four columns at both points. Asserting only the near one
// would pass while the far one stayed stale, which is the half people report.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const KIND_FIELD = "Kind";
const KEY_FIELD = "Key";
const LINK_FIELD = "Lines";
const HOST_TOTAL_FIELD = "Debit total";
const HOST_DISPLAY_FIELD = "Debit display";
const MIRROR_TOTAL_FIELD = "Host debit total";
const MIRROR_DISPLAY_FIELD = "Host debit display";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runFilteredRollupCrossBaseRefreshCase = async (
  bugCase: BugCaseFor<"filtered-rollup-cross-base-refresh">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FilteredRollupCrossBaseRefreshCaseConfig = bugCase.config;
  const hostBaseId = globalThis.testConfig.baseId;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let mirrorBaseId = "";
  let sourceTableId = "";
  let hostTableId = "";

  if (config.amountBefore === config.amountAfter) {
    throw new Error(
      "the number has to change - writing the same value back does not ask anything to be worked out again",
    );
  }

  try {
    const source = await createTable(hostBaseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
        { name: KIND_FIELD, type: FieldType.SingleLineText },
      ],
      records: [],
    });
    sourceTableId = source.id;
    const sourceNameId = source.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id as string;
    const sourceAmountId = source.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;
    const sourceKindId = source.fields.find(
      (field: { name: string }) => field.name === KIND_FIELD,
    )?.id as string;

    const host = await createTable(hostBaseId, {
      name: `${suffix}-host`,
      fields: [{ name: KEY_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [KEY_FIELD]: config.hostKey } }],
    });
    hostTableId = host.id;
    const hostKeyId = host.fields.find(
      (field: { name: string }) => field.name === KEY_FIELD,
    )?.id as string;
    const hostRowId = host.records?.[0]?.id as string;
    if (!sourceAmountId || !sourceKindId || !hostKeyId || !hostRowId) {
      throw new Error("the fixture tables are not in place");
    }

    const link = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: sourceTableId,
        lookupFieldId: sourceNameId,
      },
    });
    // The narrowed total: only the lines of the counted kind.
    const hostTotal = await createField(hostTableId, {
      name: HOST_TOTAL_FIELD,
      type: FieldType.Rollup,
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: sourceTableId,
        linkFieldId: link.id,
        lookupFieldId: sourceAmountId,
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: sourceKindId,
              operator: "is",
              value: config.countedKind,
            },
          ],
        },
      },
    });
    const hostDisplay = await createField(hostTableId, {
      name: HOST_DISPLAY_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${hostTotal.id}}` },
    });

    // The report in another base. Same space - across spaces the product
    // refuses to read another base at all.
    const mirrorBase = await createBase({
      spaceId: globalThis.testConfig.spaceId,
      name: `${suffix}-mirror`,
    });
    mirrorBaseId = mirrorBase.id;
    const mirror = await createTable(mirrorBaseId, {
      name: `${suffix}-mirror-table`,
      fields: [{ name: KEY_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [KEY_FIELD]: config.hostKey } }],
    });
    const mirrorRowId = mirror.records?.[0]?.id as string;
    const hostKeyFilter = {
      conjunction: "and",
      filterSet: [
        { fieldId: hostKeyId, operator: "is", value: config.hostKey },
      ],
    };
    const mirrorTotal = await createField(mirror.id, {
      name: MIRROR_TOTAL_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        baseId: hostBaseId,
        foreignTableId: hostTableId,
        lookupFieldId: hostTotal.id,
        expression: "sum({values})",
        filter: hostKeyFilter,
      },
    });
    const mirrorDisplay = await createField(mirror.id, {
      name: MIRROR_DISPLAY_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        baseId: hostBaseId,
        foreignTableId: hostTableId,
        lookupFieldId: hostDisplay.id,
        expression: "sum({values})",
        filter: hostKeyFilter,
      },
    });

    // The line the total counts, written and linked after everything above -
    // which is the order the report came in as, and the order that puts the
    // work on the update path rather than on the create.
    const lines = await apiCreateRecords(sourceTableId, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [sourceNameId]: config.countedLineName,
            [sourceAmountId]: config.amountBefore,
            [sourceKindId]: config.countedKind,
          },
        },
        {
          fields: {
            [sourceNameId]: config.ignoredLineName,
            [sourceAmountId]: config.ignoredAmount,
            [sourceKindId]: config.ignoredKind,
          },
        },
      ],
    });
    const countedLineId = lines.data.records[0]?.id as string;
    await apiUpdateRecord(hostTableId, hostRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [link.id]: lines.data.records.map(({ id }: { id: string }) => ({
            id,
          })),
        },
      },
    });

    const readAll = async () => {
      const hostRows = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const mirrorRows = await apiGetRecords(mirror.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const hostFields = hostRows.data.records[0]?.fields ?? {};
      const mirrorFields = mirrorRows.data.records[0]?.fields ?? {};
      return {
        headers: hostRows.headers,
        values: {
          hostTotal: hostFields[hostTotal.id] ?? null,
          hostDisplay: hostFields[hostDisplay.id] ?? null,
          mirrorTotal: mirrorFields[mirrorTotal.id] ?? null,
          mirrorDisplay: mirrorFields[mirrorDisplay.id] ?? null,
        },
      };
    };
    const settle = async (expected: number) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let seen = await readAll();
      while (
        Object.values(seen.values).some(
          (value) => Number(value) !== expected,
        ) &&
        Date.now() < deadline
      ) {
        await sleep(config.pollIntervalMs);
        seen = await readAll();
      }
      return seen;
    };

    // Fixture verification, outside the checkpoint: all four columns agree on
    // the number before anything changes. Without that, four stale values and
    // four values that never computed look the same.
    const before = await settle(config.amountBefore);
    assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const wrongBefore = Object.entries(before.values).filter(
      ([, value]) => Number(value) !== config.amountBefore,
    );
    if (wrongBefore.length > 0) {
      throw new Error(
        `before the change the chain reads ${JSON.stringify(before.values)}, expected ${config.amountBefore} ` +
          "everywhere - the fixture never computed, so there is nothing for a change to fail to reach",
      );
    }

    const probe = await bugCheckpoint(
      "a-change-reaches-every-summary-that-reads-it",
      async () => {
        await apiUpdateRecord(sourceTableId, countedLineId, {
          fieldKeyType: FieldKeyType.Id,
          record: { fields: { [sourceAmountId]: config.amountAfter } },
        });

        const after = await settle(config.amountAfter);
        const stale = Object.entries(after.values).filter(
          ([, value]) => Number(value) !== config.amountAfter,
        );
        if (stale.length > 0) {
          throw new Error(
            `after ${config.settleTimeoutMs}ms the chain reads ${JSON.stringify(after.values)}, expected ` +
              `${config.amountAfter} everywhere - ${stale
                .map(([name]) => name)
                .join(
                  ", ",
                )} still hold the number from before, and nothing on the row says so`,
          );
        }
        return { values: after.values };
      },
    );

    return {
      details: {
        sourceTableId,
        hostTableId,
        mirrorBaseId,
        countedKind: config.countedKind,
        amountBefore: config.amountBefore,
        amountAfter: config.amountAfter,
        valuesBefore: before.values,
        valuesAfter: probe.values,
      },
    };
  } finally {
    for (const tableId of [hostTableId, sourceTableId]) {
      if (tableId) {
        try {
          await permanentDeleteTable(hostBaseId, tableId);
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
    if (mirrorBaseId) {
      try {
        await deleteBase(mirrorBaseId);
        await permanentDeleteBase(mirrorBaseId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (base ${mirrorBaseId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
