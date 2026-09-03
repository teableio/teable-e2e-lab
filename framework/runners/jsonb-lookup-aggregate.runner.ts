import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  getFields as apiGetFields,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { JsonbLookupAggregateCaseConfig } from "../types";

// A conditional total asking for the LARGEST or the SMALLEST - over a column
// that is itself a borrowed list -> checkpoint: the totals read, and
// they read the right answers.
//
// Chains like this are ordinary. A team row borrows every task's amount from
// the task table, so that column holds a list rather than one value. A report
// row then matches its teams and asks for the largest amount across them. Sum
// and average had been taught to look inside those lists; largest, smallest,
// all-of and any-of had not, and went straight at the stored list. Postgres
// refuses that outright - there is no largest of a list - and the column never
// produced anything.
//
// Only the number half is asked here. The tickbox half of the same fix cannot
// be told apart through a borrowed list: an unticked box does not reach that
// list at all, measured as [true] for a pair of leaves ticked and unticked, so
// all-of and any-of return the same answer whether they work or not.
//
// What the user is left with is a column that stays empty with no explanation,
// on a field the interface offered to build. Sum on the same source works,
// which makes it look like the data is wrong rather than the function.
//
// The chain is three tables because two will not do it: the source column has
// to be a borrowed list, and a column only becomes a list by borrowing across a
// one-to-many. A total straight off a plain number column takes a different
// path and works on both sides of the fix.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const LEAF_LINK_FIELD = "Leaves";
const AMOUNT_LOOKUP_FIELD = "Amounts borrowed";
const MATCH_FIELD = "MatchKey";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runJsonbLookupAggregateCase = async (
  bugCase: BugCaseFor<"jsonb-lookup-aggregate">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: JsonbLookupAggregateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.leaves.length < 2) {
    throw new Error(
      "at least two leaf rows, or the borrowed column holds one value and the aggregation has nothing to choose between",
    );
  }

  try {
    // The far end: the rows carrying the actual values.
    const leaf = await createTable(baseId, {
      name: `${suffix}-leaf`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.leaves.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [AMOUNT_FIELD]: row.amount,
        },
      })),
    });
    createdTableIds.unshift(leaf.id);
    const leafAmountId = leaf.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;

    // The middle: one row borrowing every leaf value, so its borrowed columns
    // hold lists rather than single values.
    const middle = await createTable(baseId, {
      name: `${suffix}-middle`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: MATCH_FIELD, type: FieldType.SingleLineText },
      ],
      records: [],
    });
    createdTableIds.unshift(middle.id);
    const middleMatchId = middle.fields.find(
      (field: { name: string }) => field.name === MATCH_FIELD,
    )?.id as string;
    const leafLink = await createField(middle.id, {
      name: LEAF_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: leaf.id,
      },
    });
    await createRecords(middle.id, {
      fieldKeyType: FieldKeyType.Id,
      typecast: false,
      records: [
        {
          fields: {
            [middle.fields[0].id]: config.middleRowName,
            [middleMatchId]: config.matchKey,
            [leafLink.id]: leaf.records.map((record: { id: string }) => ({
              id: record.id,
            })),
          },
        },
      ],
    });
    const amountLookup = await createField(middle.id, {
      name: AMOUNT_LOOKUP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: leaf.id,
        linkFieldId: leafLink.id,
        lookupFieldId: leafAmountId,
      },
    });

    // Fixture verification, outside the checkpoint: the borrowed columns really
    // do hold lists. If they held one value each, the aggregations would take
    // the ordinary path and answer correctly on both sides of the fix.
    for (const borrowed of [amountLookup]) {
      if (
        !(borrowed as { isMultipleCellValue?: boolean }).isMultipleCellValue
      ) {
        throw new Error(
          `the borrowed column ${borrowed.name} does not hold a list - the fixture is not in place`,
        );
      }
    }

    // What the expected answers are worked out FROM: the lists the product
    // actually built, read back off the middle row rather than assumed from the
    // leaf rows. The two are not the same - a borrowed tickbox column does not
    // necessarily carry an entry for every leaf - and a case that asserted
    // against the leaves would be asserting against its own model of the
    // product instead of against the product.
    const middleRows = await apiGetRecords(middle.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 1,
    });
    const borrowedAmounts = middleRows.data.records[0]?.fields[
      amountLookup.id
    ] as number[] | undefined;
    if (!Array.isArray(borrowedAmounts) || borrowedAmounts.length < 2) {
      throw new Error(
        `the borrowed amounts read ${JSON.stringify(borrowedAmounts)} - the aggregation needs a list to choose between`,
      );
    }
    const expected: Record<string, number> = {
      max: Math.max(...borrowedAmounts),
      min: Math.min(...borrowedAmounts),
    };
    if (expected.max === expected.min) {
      throw new Error(
        `the borrowed amounts are all ${expected.max} - largest and smallest cannot be told apart`,
      );
    }

    // The near end: a row matching the middle row and totalling across it.
    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: MATCH_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.hostRowName,
            [MATCH_FIELD]: config.matchKey,
          },
        },
      ],
    });
    createdTableIds.unshift(host.id);
    const hostMatchId = host.fields.find(
      (field: { name: string }) => field.name === MATCH_FIELD,
    )?.id as string;

    const matchFilter = {
      conjunction: "and",
      filterSet: [
        {
          fieldId: middleMatchId,
          operator: "is",
          value: { type: "field", fieldId: hostMatchId },
        },
      ],
    };

    const readHost = async () => {
      const response = await apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      return {
        headers: response.headers,
        fields: response.data.records[0]?.fields ?? {},
      };
    };

    // The engine assertion, on the read that derives the expected answers and
    // on the same endpoint and feature the checkpoint reads through. Outside
    // the checkpoint, so a v1 answer is the case failing to run rather than the
    // bug.
    const routing = assertServedByV2(middleRows.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "the-largest-of-a-borrowed-list-is-a-number",
      async () => {
        // Asking for the total is INSIDE the checkpoint, because asking is what
        // fails: before the fix the create refuses outright, with the database
        // saying there is no largest of a list. Building the chain that column
        // reads from is setup; asking the question is the observation.
        const totals: { name: string; expression: string; expected: number }[] =
          [];
        for (const which of config.aggregations) {
          const name = `${which} of the borrowed list`;
          await createField(host.id, {
            name,
            type: FieldType.ConditionalRollup,
            options: {
              foreignTableId: middle.id,
              lookupFieldId: amountLookup.id,
              expression: `${which}({values})`,
              filter: matchFilter,
            },
          });
          totals.push({
            name,
            expression: `${which}({values})`,
            expected: expected[which],
          });
        }

        // Waiting for the answers to arrive, not for the bug to appear: the
        // loop leaves as soon as every total reads what it should.
        const deadline = Date.now() + config.settleTimeoutMs;
        let settled = await readHost();
        for (;;) {
          const done = totals.every(
            (total) => settled.fields[total.name] === total.expected,
          );
          if (done || Date.now() >= deadline) {
            break;
          }
          await sleep(config.pollIntervalMs);
          settled = await readHost();
        }

        const observed = totals.map((total) => ({
          total: total.expression,
          read: settled.fields[total.name] ?? null,
          expected: total.expected,
        }));

        // The columns' own state as well: a column the product marks broken is
        // the honest half of this, and it says the failure is the function
        // rather than the data.
        const hostFields = await apiGetFields(host.id);
        const broken = hostFields.data
          .filter(
            (field: { name: string; hasError?: boolean }) =>
              field.hasError &&
              totals.some((total) => total.name === field.name),
          )
          .map((field: { name: string }) => field.name);

        const wrong = observed.filter((item) => item.read !== item.expected);
        if (wrong.length > 0) {
          throw new Error(
            `the totals over a borrowed list read ${JSON.stringify(observed)}` +
              (broken.length > 0
                ? `; the product marks these columns broken: ${JSON.stringify(broken)}`
                : "; the product does not mark any of them broken"),
          );
        }
        if (broken.length > 0) {
          throw new Error(
            `the totals read correctly but the product marks ${JSON.stringify(broken)} broken`,
          );
        }
        return { observed };
      },
    );

    return {
      details: {
        leafTableId: leaf.id,
        middleTableId: middle.id,
        hostTableId: host.id,
        routing,
        ...probe,
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
