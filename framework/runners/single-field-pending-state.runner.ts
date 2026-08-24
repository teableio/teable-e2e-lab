import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SingleFieldPendingStateCaseConfig } from "../types";

// Worked-out columns that have finished being worked out -> read one of them
// on its own -> checkpoint: it is reported as finished, the same as in the
// list of columns.
//
// A worked-out column is marked while its values are still being filled in,
// and the interface draws that mark as a column that is still busy. The mark
// is supposed to come off when the filling in is done.
//
// Asked for one column on its own, the product kept saying "still busy" for
// every worked-out column, forever. Asked for the whole list, it said they
// were done - which is the shape that wastes an afternoon: the same column is
// finished in one place on screen and busy in another, and nothing the person
// does moves it.
//
// The case waits for the columns to actually settle before it looks, because
// "still busy" is a correct answer while they are.

const NAME_FIELD = "Title";
const MEMBER_NAME_FIELD = "Member name";
const HANDLE_FIELD = "Handle";

export const runSingleFieldPendingStateCase = async (
  bugCase: BugCaseFor<"single-field-pending-state">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SingleFieldPendingStateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const directory = await createTable(baseId, {
      name: `${suffix}-directory`,
      fields: [
        {
          name: MEMBER_NAME_FIELD,
          type: FieldType.SingleLineText,
          isPrimary: true,
        },
        { name: HANDLE_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [MEMBER_NAME_FIELD]: config.memberName,
            [HANDLE_FIELD]: config.memberHandle,
          },
        },
      ],
    });
    createdTableIds.unshift(directory.id);
    const memberNameId = directory.fields.find(
      (field: { name: string }) => field.name === MEMBER_NAME_FIELD,
    )?.id;
    const handleId = directory.fields.find(
      (field: { name: string }) => field.name === HANDLE_FIELD,
    )?.id;
    if (!memberNameId || !handleId) {
      throw new Error("the directory table is not in place");
    }

    const hub = await createTable(baseId, {
      name: `${suffix}-hub`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    createdTableIds.unshift(hub.id);
    const titleFieldId = hub.fields[0].id;

    const link = await createField(hub.id, {
      name: "Editor",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: directory.id,
      },
    });

    // Three worked-out columns of the three kinds a person meets: one that
    // computes from this table, one that borrows a value from the other, and
    // one that totals over it. The bug did not distinguish between them, and
    // reading all three keeps the case from resting on one kind.
    const formula = await createField(hub.id, {
      name: "Title length",
      type: FieldType.Formula,
      options: { expression: `LEN({${titleFieldId}})` },
    });
    const lookup = await createField(hub.id, {
      name: "Editor name",
      type: FieldType.SingleLineText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: directory.id,
        linkFieldId: link.id,
        lookupFieldId: memberNameId,
      },
    });
    const rollup = await createField(hub.id, {
      name: "Editor handle",
      type: FieldType.Rollup,
      options: { expression: "concatenate({values})" },
      lookupOptions: {
        foreignTableId: directory.id,
        linkFieldId: link.id,
        lookupFieldId: handleId,
      },
    });
    const computedIds = [formula.id, lookup.id, rollup.id];

    // Fixture verification, outside the checkpoint: wait until the columns
    // have really settled. Until then "still busy" is the truth, and a case
    // that looked earlier would be reporting the product being right.
    let settled = false;
    let lastListed: Record<string, boolean> = {};
    for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
      const records = await apiGetRecords(hub.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const computedValue = records.data.records[0]?.fields[formula.id];
      const listed = await getFields(hub.id);
      lastListed = Object.fromEntries(
        computedIds.map((id) => [
          id,
          Boolean(
            listed.find((field: { id: string }) => field.id === id)?.isPending,
          ),
        ]),
      );
      if (
        computedValue != null &&
        computedIds.every((id) => lastListed[id] === false)
      ) {
        settled = true;
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, config.settleIntervalMs),
      );
    }
    if (!settled) {
      throw new Error(
        `the worked-out columns never settled within ${config.settleAttempts} tries: ${JSON.stringify(lastListed)}`,
      );
    }

    const probe = await bugCheckpoint(
      "one-column-read-on-its-own-is-not-still-busy",
      async () => {
        const listed = await getFields(hub.id);
        const disagreeing: Record<string, unknown>[] = [];
        for (const id of computedIds) {
          const inList = listed.find(
            (field: { id: string }) => field.id === id,
          );
          const alone = await getField(hub.id, id);
          if (alone.isComputed !== true) {
            throw new Error(
              `the column ${alone.name} is not reported as worked out at all, so the case is watching the wrong column`,
            );
          }
          if (Boolean(alone.isPending) !== Boolean(inList?.isPending)) {
            disagreeing.push({
              name: alone.name,
              onItsOwn: Boolean(alone.isPending),
              inTheList: Boolean(inList?.isPending),
            });
          }
        }
        if (disagreeing.length > 0) {
          throw new Error(
            `${disagreeing.length} of ${computedIds.length} worked-out columns are reported as still busy when read on their own and finished in the list: ` +
              `${JSON.stringify(disagreeing)} - the same column is busy in one place on screen and done in another`,
          );
        }
        return { columns: computedIds.length };
      },
    );

    return {
      details: {
        hubTableId: hub.id,
        directoryTableId: directory.id,
        computedColumns: probe.columns,
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
