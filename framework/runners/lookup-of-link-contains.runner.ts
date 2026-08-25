import { contains, FieldKeyType, FieldType, Relationship } from "@teable/core";
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
import type { LookupOfLinkContainsCaseConfig } from "../types";

// A column that borrows a link from another table -> filter it by part of a
// name -> checkpoint: the rows whose borrowed link shows that name come back.
//
// A borrowed link column shows names, the same as the link column it borrows
// from. Typing part of one of those names into "contains" is how a person
// looks for anything in a table with more rows than fits on a screen.
//
// It found nothing. Not the wrong rows - nothing, on every search, while the
// names being searched sit visible in the column. There is no error and
// nothing to report; the view is simply empty, and the natural reading is that
// the rows are not there.
//
// The two names in the fixture share no letters, so a filter that matched
// everything and a filter that matched the right row cannot be confused.

const NAME_FIELD = "Name";
const TARGET_LINK = "Target";
const BORROWED_LINK = "Target, borrowed";

export const runLookupOfLinkContainsCase = async (
  bugCase: BugCaseFor<"lookup-of-link-contains">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupOfLinkContainsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  const [firstTarget, secondTarget] = config.targetNames;
  if (!firstTarget || !secondTarget) {
    throw new Error("two target names - see the runner");
  }
  if (!firstTarget.includes(config.searchTerm)) {
    throw new Error(
      `the search term ${JSON.stringify(config.searchTerm)} is not part of ${JSON.stringify(firstTarget)}, so nothing could match it`,
    );
  }
  if (secondTarget.includes(config.searchTerm)) {
    throw new Error(
      `the search term ${JSON.stringify(config.searchTerm)} is also part of ${JSON.stringify(secondTarget)}, so a filter that matched everything would look correct`,
    );
  }

  try {
    // The far end: the rows whose names are searched.
    const targets = await createTable(baseId, {
      name: `${suffix}-targets`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.targetNames.map((name) => ({
        fields: { [NAME_FIELD]: name },
      })),
    });
    createdTableIds.unshift(targets.id);
    const targetIds = (targets.records ?? []).map(
      (record: { id: string }) => record.id,
    );
    if (targetIds.length !== config.targetNames.length) {
      throw new Error("the table of targets is not in place");
    }

    // The middle: rows that link to a target.
    const middle = await createTable(baseId, {
      name: `${suffix}-middle`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(middle.id);
    const middleLink = await createField(middle.id, {
      name: TARGET_LINK,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: targets.id,
      },
    });

    // The near end: rows that link to the middle and borrow its link column.
    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(host.id);
    const hostLink = await createField(host.id, {
      name: "Middle",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: middle.id,
      },
    });
    const borrowed = await createField(host.id, {
      name: BORROWED_LINK,
      type: FieldType.Link,
      isLookup: true,
      lookupOptions: {
        foreignTableId: middle.id,
        linkFieldId: hostLink.id,
        lookupFieldId: middleLink.id,
      },
    });

    // One chain per target: a middle row pointing at it, and a host row
    // pointing at that middle row.
    const rowNames = config.targetNames.map((_, index) => `row-${index}`);

    const madeMiddle = await apiCreateRecords(middle.id, {
      fieldKeyType: FieldKeyType.Id,
      records: targetIds.map((targetId, index) => ({
        fields: {
          [middle.fields[0].id]: `middle-${index}`,
          [middleLink.id]: { id: targetId },
        },
      })),
    });
    const middleIds = madeMiddle.data.records.map(
      (record: { id: string }) => record.id,
    );
    const madeHost = await apiCreateRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      records: middleIds.map((middleId, index) => ({
        fields: {
          [host.fields[0].id]: rowNames[index],
          [hostLink.id]: { id: middleId },
        },
      })),
    });
    if (madeHost.data.records.length !== rowNames.length) {
      throw new Error("the host rows are not in place");
    }

    // Fixture verification, outside the checkpoint: the borrowed column really
    // shows the names being searched. Without this the case could not tell
    // "the filter found nothing" from "there was nothing to find".
    const all = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 10,
    });
    const shown = all.data.records.map(
      (record: { fields: Record<string, unknown> }) => {
        const cell = record.fields[borrowed.id] as
          | { title?: string }
          | { title?: string }[]
          | undefined;
        const list = Array.isArray(cell) ? cell : cell ? [cell] : [];
        return list.map((link) => link.title).join(",");
      },
    );
    if (!shown.some((value: string) => value.includes(config.searchTerm))) {
      throw new Error(
        `the borrowed column shows ${JSON.stringify(shown)}, none of which contains ${JSON.stringify(config.searchTerm)} - there would be nothing for the filter to find`,
      );
    }

    const probe = await bugCheckpoint(
      "a-borrowed-link-can-be-filtered-by-part-of-a-name",
      async () => {
        const filtered = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Name,
          take: 10,
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: borrowed.id,
                operator: contains.value,
                value: config.searchTerm,
              },
            ],
          },
        });
        const routing = assertServedByV2(filtered.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const names = filtered.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
          )
          .sort();
        if (names.join(" ") !== rowNames[0]) {
          throw new Error(
            `searching the borrowed column for ${JSON.stringify(config.searchTerm)} found [${names.join(", ")}], expected ${rowNames[0]} - ` +
              `the name it is part of is sitting in that column`,
          );
        }
        return { routing, names };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        middleTableId: middle.id,
        targetsTableId: targets.id,
        searchTerm: config.searchTerm,
        routing: probe.routing,
        found: probe.names,
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
