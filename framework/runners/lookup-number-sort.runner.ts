import { FieldKeyType, FieldType, Relationship, SortFunc } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupNumberSortCaseConfig } from "../types";

// A number borrowed from another table through a link -> sort by it ->
// checkpoint: the rows come back in numeric order.
//
// Sorted ascending, 2, 5, 12, 13 and 22 came back as 12, 13, 2, 22, 5 - the
// order of the digits read as text. The column shows numbers, the source
// column sorts them as numbers, and the borrowed copy of it does not.
//
// The values are chosen so the two readings disagree: as text, "12" comes
// before "2" and "22" before "5". Single-digit values alone would sort the
// same either way.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const LINK_FIELD = "Source";
const LOOKUP_FIELD = "Borrowed amount";

export const runLookupNumberSortCase = async (
  bugCase: BugCaseFor<"lookup-number-sort">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupNumberSortCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  const numeric = [...config.amounts].sort((left, right) => left - right);
  const asText = [...config.amounts].sort((left, right) =>
    String(left).localeCompare(String(right)),
  );
  if (numeric.join(" ") === asText.join(" ")) {
    throw new Error(
      `the amounts ${JSON.stringify(config.amounts)} sort the same as numbers and as text - ` +
        "a sort that compared them as text would look correct",
    );
  }
  if (new Set(config.amounts).size !== config.amounts.length) {
    throw new Error("two amounts are equal - their order is not defined");
  }
  const rowName = (amount: number) => `row-${amount}`;

  try {
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: AMOUNT_FIELD,
          type: FieldType.Number,
          options: { formatting: { type: "decimal", precision: 0 } },
        },
      ],
      records: config.amounts.map((amount) => ({
        fields: { [NAME_FIELD]: `source-${amount}`, [AMOUNT_FIELD]: amount },
      })),
    });
    createdTableIds.unshift(source.id);
    const amountFieldId = source.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;
    const sourceIdByAmount = new Map<number, string>(
      source.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          Number(record.fields[AMOUNT_FIELD]),
          record.id,
        ],
      ),
    );

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(host.id);
    const nameFieldId = host.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id as string;
    // Many-to-many, as in the report: the borrowed column holds a list, even
    // when each row links one source row.
    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: source.id,
      },
    });
    const lookup = await createField(host.id, {
      name: LOOKUP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: source.id,
        linkFieldId: link.id,
        lookupFieldId: amountFieldId,
      },
    });

    await apiCreateRecords(host.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: config.amounts.map((amount) => ({
        fields: {
          [NAME_FIELD]: rowName(amount),
          [LINK_FIELD]: [{ id: sourceIdByAmount.get(amount) as string }],
        },
      })),
    });

    const readSorted = async () =>
      apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Id,
        take: config.amounts.length + 1,
        orderBy: [{ fieldId: lookup.id, order: SortFunc.Asc }],
      });

    // Fixture verification, outside the checkpoint: every row borrowed the
    // number of the source row it links. A row with an empty borrowed column
    // would be sorted for a different reason.
    const first = await readSorted();
    const routing = assertServedByV2(first.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const borrowed = new Map<string, unknown>(
      first.data.records.map((record: { fields: Record<string, unknown> }) => [
        String(record.fields[nameFieldId]),
        record.fields[lookup.id],
      ]),
    );
    for (const amount of config.amounts) {
      const value = borrowed.get(rowName(amount));
      if (JSON.stringify(value) !== JSON.stringify([amount])) {
        throw new Error(
          `row ${rowName(amount)} borrowed ${JSON.stringify(value)}, not [${amount}] - the lookup is not in place`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "sorting-by-a-borrowed-number-is-numeric",
      async () => {
        const sorted = await readSorted();
        const order = sorted.data.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[nameFieldId]),
        );
        const expected = numeric.map(rowName);
        if (order.join(" ") !== expected.join(" ")) {
          const readsAsText = order.join(" ") === asText.map(rowName).join(" ");
          throw new Error(
            `sorting ascending by the borrowed number put the rows in ${JSON.stringify(order)}, ` +
              `expected ${JSON.stringify(expected)}` +
              (readsAsText
                ? " - that is the order of the numbers read as text"
                : ""),
          );
        }
        return { order };
      },
    );

    return {
      details: {
        tableIds: createdTableIds,
        routing,
        sortedOrder: probe.order,
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
