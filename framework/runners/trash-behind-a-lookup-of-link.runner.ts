import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  DELETE_TABLE,
  ResourceType,
  axios,
  getRecords as apiGetRecords,
  getTrashItems as apiGetTrashItems,
  urlBuilder,
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
import type { TrashBehindALookupOfLinkCaseConfig } from "../types";

// Three tables in a chain: a far table, a middle table that links to it, and a
// host that borrows the middle table's link column through its own link ->
// move the far table to the trash -> checkpoint: the delete goes through, the
// far table is in the trash, and the host still shows what it borrowed.
//
// Trashing a table turns every link pointing at it into text, and anything
// borrowing that link has to be worked out again. The borrowed column on the
// host is a single value stored as JSON; it was refilled with text, which the
// database refused. The delete failed - and the table it was deleting then
// vanished: not in the list, not in the trash, with nothing a user could click
// to bring it back. Its rows were all still there.
//
// Both links are many-to-one, which is what makes the borrowed column a single
// value rather than a list. That is the shape that was refused.

const NAME_FIELD = "Name";
const FAR_LINK_FIELD = "Far";
const MIDDLE_LINK_FIELD = "Middle";
const BORROWED_FIELD = "Borrowed far";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runTrashBehindALookupOfLinkCase = async (
  bugCase: BugCaseFor<"trash-behind-a-lookup-of-link">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TrashBehindALookupOfLinkCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const far = await createTable(baseId, {
      name: `${suffix}-far`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.farRowTitle } }],
    });
    createdTableIds.unshift(far.id);
    const farRecordId = far.records[0]?.id as string;

    const middle = await createTable(baseId, {
      name: `${suffix}-middle`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(middle.id);
    const farLink = await createField(middle.id, {
      name: FAR_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: far.id,
      },
    });
    const middleRows = await createRecords(middle.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: "middle-row",
            [FAR_LINK_FIELD]: { id: farRecordId },
          },
        },
      ],
    });
    const middleRecordId = middleRows.records[0]?.id as string;

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(host.id);
    const middleLink = await createField(host.id, {
      name: MIDDLE_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: middle.id,
      },
    });
    await createRecords(host.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: "host-row",
            [MIDDLE_LINK_FIELD]: { id: middleRecordId },
          },
        },
      ],
    });
    const borrowed = await createField(host.id, {
      name: BORROWED_FIELD,
      type: FieldType.Link,
      isLookup: true,
      lookupOptions: {
        foreignTableId: middle.id,
        linkFieldId: middleLink.id,
        lookupFieldId: farLink.id,
      },
    });

    const readBorrowed = async () => {
      const response = await apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 2,
      });
      return {
        headers: response.headers,
        cell: response.data.records[0]?.fields?.[borrowed.id],
      };
    };

    // Fixture verification, outside the checkpoint: the host borrowed the far
    // row, as a single value. A list would be the shape that always worked.
    const before = await readBorrowed();
    const readRouting = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (
      Array.isArray(before.cell) ||
      !JSON.stringify(before.cell ?? null).includes(config.farRowTitle)
    ) {
      throw new Error(
        `the borrowed column reads ${JSON.stringify(before.cell)}, expected a single value naming ` +
          `"${config.farRowTitle}" - the fixture is not in place`,
      );
    }

    // Raw axios with the status left open: a refused delete is the report,
    // and the generated client drops the routing headers with it.
    const deleteResponse = await axios.delete(
      urlBuilder(DELETE_TABLE, { baseId, tableId: far.id }),
      { validateStatus: () => true },
    );
    const deleteRouting = assertServedByV2(deleteResponse.headers, {
      operation: "DELETE /base/{baseId}/table/{tableId}",
      feature: "deleteTable",
    });

    const probe = await bugCheckpoint(
      "trashing-a-table-behind-a-borrowed-link-goes-through",
      async () => {
        if (deleteResponse.status >= 300) {
          throw new Error(
            `moving the far table to the trash answered ${deleteResponse.status}: ` +
              `${typeof deleteResponse.data === "string" ? deleteResponse.data : JSON.stringify(deleteResponse.data)}`,
          );
        }

        // The table has to be somewhere a user can find it: in the trash.
        const deadline = Date.now() + config.settleTimeoutMs;
        let inTrash = false;
        for (;;) {
          const items = await apiGetTrashItems({
            resourceType: ResourceType.Base,
            resourceId: baseId,
          });
          inTrash = (items.data.trashItems ?? []).some(
            (item: { resourceId?: string }) => item.resourceId === far.id,
          );
          if (inTrash || Date.now() >= deadline) {
            break;
          }
          await sleep(config.pollIntervalMs);
        }
        if (!inTrash) {
          throw new Error(
            `the delete answered ${deleteResponse.status}, but the far table is not in the trash after ` +
              `${config.settleTimeoutMs}ms - it is somewhere nobody can restore it from`,
          );
        }

        const after = await readBorrowed();
        if (!JSON.stringify(after.cell ?? null).includes(config.farRowTitle)) {
          throw new Error(
            `the far table is in the trash, but the host's borrowed column now reads ` +
              `${JSON.stringify(after.cell)} - it lost "${config.farRowTitle}"`,
          );
        }
        return { cellAfter: after.cell };
      },
    );

    return {
      details: {
        tableIds: createdTableIds,
        readRouting,
        deleteRouting,
        deleteStatus: deleteResponse.status,
        cellBefore: before.cell,
        cellAfter: probe.cellAfter,
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
