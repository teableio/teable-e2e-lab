import { FieldKeyType, FieldType, Relationship } from "@teable/core";
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
import type { LinkRollupUniqueByIdentityCaseConfig } from "../types";

// A summary listing the distinct linked records across a row's children ->
// checkpoint: it lists as many as there are, when every one of them is a
// different record.
//
// Two records are the same record when they have the same id. They are not the
// same record when they happen to be called the same thing - and nothing stops
// two rows sharing a name, because a name is a value someone typed. The summary
// compared what it displayed rather than what it had, so two different records
// both called "Same" collapsed into one and a real linked record left the
// answer.
//
// It leaves quietly. The column is not marked, the answer is a plausible list
// of names, and the only way to notice is to count against the summary beside
// it that keeps everything. Anything reading the column afterwards - a formula,
// a count, a filter, a report - is short by one and has no way to know.
//
// The case does not assert a list of names. It asserts that the distinct
// summary equals the keep-everything summary, because when every linked record
// is a different record those two ARE the same answer. That invariant holds
// whatever shape the values come back in, which matters here: what these cells
// contain has changed more than once.

const NAME_FIELD = "Name";
const TARGET_LINK_FIELD = "Target";
const CHILD_LINK_FIELD = "Children";
const COMPACT_FIELD = "Every linked record";
const UNIQUE_FIELD = "The distinct ones";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runLinkRollupUniqueByIdentityCase = async (
  bugCase: BugCaseFor<"link-rollup-unique-by-identity">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkRollupUniqueByIdentityCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  const titles = config.targetTitles;
  if (titles.length < 2) {
    throw new Error(
      "at least two linked records, or there is nothing to merge",
    );
  }
  if (new Set(titles).size === titles.length) {
    throw new Error(
      `the linked records are all called something different (${JSON.stringify(titles)}) - ` +
        "with no two sharing a name, merging by name and keeping by identity give the same answer",
    );
  }

  try {
    // The records the summary is about. Two of them share a name and are
    // nonetheless two records.
    const targets = await createTable(baseId, {
      name: `${suffix}-targets`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: titles.map((title) => ({ fields: { [NAME_FIELD]: title } })),
    });
    createdTableIds.unshift(targets.id);
    const targetIds = targets.records.map(
      (record: { id: string }) => record.id,
    );
    if (new Set(targetIds).size !== targetIds.length) {
      throw new Error("the seeded records are not distinct records");
    }

    // One child per target, each pointing at its own.
    const children = await createTable(baseId, {
      name: `${suffix}-children`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(children.id);
    const targetLink = await createField(children.id, {
      name: TARGET_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: targets.id,
      },
    });
    const childRows = await apiCreateRecords(children.id, {
      fieldKeyType: FieldKeyType.Id,
      typecast: false,
      records: targetIds.map((targetId: string, index: number) => ({
        fields: {
          [children.fields[0].id]: `${config.childNamePrefix}-${index + 1}`,
          [targetLink.id]: { id: targetId },
        },
      })),
    });

    // The row doing the summarising.
    const parent = await createTable(baseId, {
      name: `${suffix}-parent`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(parent.id);
    const childLink = await createField(parent.id, {
      name: CHILD_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: children.id,
      },
    });
    await apiCreateRecords(parent.id, {
      fieldKeyType: FieldKeyType.Id,
      typecast: false,
      records: [
        {
          fields: {
            [parent.fields[0].id]: config.parentRowName,
            [childLink.id]: childRows.data.records.map(
              (record: { id: string }) => ({ id: record.id }),
            ),
          },
        },
      ],
    });

    const summary = async (name: string, expression: string) =>
      createField(parent.id, {
        name,
        type: FieldType.Rollup,
        options: { expression },
        lookupOptions: {
          foreignTableId: children.id,
          linkFieldId: childLink.id,
          lookupFieldId: targetLink.id,
        },
      });
    await summary(COMPACT_FIELD, "array_compact({values})");
    await summary(UNIQUE_FIELD, "array_unique({values})");

    const readParent = async () => {
      const response = await apiGetRecords(parent.id, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      return {
        headers: response.headers,
        fields: response.data.records[0]?.fields ?? {},
      };
    };

    const sizeOf = (value: unknown) =>
      Array.isArray(value) ? value.length : value == null ? 0 : 1;

    // Settling on the KEEP-EVERYTHING summary reaching one entry per linked
    // record. That column is right on both sides of the fix, so waiting for it
    // is waiting for the computation to finish rather than for the bug.
    const deadline = Date.now() + config.settleTimeoutMs;
    let settled = await readParent();
    for (;;) {
      if (
        sizeOf(settled.fields[COMPACT_FIELD]) === titles.length ||
        Date.now() >= deadline
      ) {
        break;
      }
      await sleep(config.pollIntervalMs);
      settled = await readParent();
    }

    const routing = assertServedByV2(settled.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-summary-of-distinct-linked-records-keeps-all-of-them",
      async () => {
        const everything = settled.fields[COMPACT_FIELD];
        const distinct = settled.fields[UNIQUE_FIELD];
        const scene = {
          everyLinkedRecord: everything ?? null,
          theDistinctOnes: distinct ?? null,
          linkedRecordsSeeded: titles.length,
          namesSeeded: titles,
        };

        // The control: the summary that keeps everything has to hold one entry
        // per linked record. If it does not, the chain never computed and the
        // comparison below would be between two wrong answers.
        if (sizeOf(everything) !== titles.length) {
          throw new Error(
            `the summary that keeps everything holds ${sizeOf(everything)} of ${titles.length} linked records: ` +
              JSON.stringify(scene),
          );
        }

        // The claim. Every linked record here IS a different record, so the
        // distinct summary and the keep-everything summary are the same answer
        // - whatever these cells happen to contain.
        if (JSON.stringify(distinct) !== JSON.stringify(everything)) {
          throw new Error(
            `every linked record is a different record, so the distinct summary should match the one that ` +
              `keeps everything, and it does not: ${JSON.stringify(scene)}` +
              (sizeOf(distinct) < sizeOf(everything)
                ? `. ${sizeOf(everything) - sizeOf(distinct)} record(s) left the answer - records sharing a name were treated as one record`
                : ""),
          );
        }
        return { scene };
      },
    );

    return {
      details: {
        targetsTableId: targets.id,
        childrenTableId: children.id,
        parentTableId: parent.id,
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
