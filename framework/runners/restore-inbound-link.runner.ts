import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  getTrashItems as apiGetTrashItems,
  restoreTrash as apiRestoreTrash,
  updateRecord as apiUpdateRecord,
  DELETE_TABLE,
  ResourceType,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RestoreInboundLinkCaseConfig } from "../types";

// A table other tables link to, put in the trash and taken back out ->
// checkpoint: the columns pointing at it are links again, holding what they
// held.
//
// Deleting a table into the trash is reversible by design - that is what a
// trash is for, and it is the reason people are willing to delete anything.
// The other side of a link is where the reversal has to reach: a column on
// another table that pointed at the deleted one, and the looked-up values
// beside it.
//
// Restoring brought the table back and left those columns behind: no longer
// links, no longer holding the row they pointed at. The table is back, its
// data is back, and the connections between it and the rest of the base are
// not - which is worse than an obvious failure, because everything looks
// restored.

const NAME_FIELD = "Name";
const DETAIL_FIELD = "Detail";
const LINK_FIELD = "Account";
const LOOKUP_FIELD = "Account detail";

export const runRestoreInboundLinkCase = async (
  bugCase: BugCaseFor<"restore-inbound-link">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RestoreInboundLinkCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: DETAIL_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.foreignRowTitle,
            [DETAIL_FIELD]: config.foreignDetail,
          },
        },
      ],
    });
    createdTableIds.unshift(foreign.id);
    const foreignRecordId = foreign.records[0]?.id;
    const detailFieldId = foreign.fields.find(
      (field: { name: string }) => field.name === DETAIL_FIELD,
    )?.id;

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowTitle } }],
    });
    createdTableIds.unshift(host.id);
    const hostRecordId = host.records[0]?.id;
    if (!foreignRecordId || !detailFieldId || !hostRecordId) {
      throw new Error("the fixture tables are not in place");
    }

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });
    const lookupField = await createField(host.id, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: foreign.id,
        linkFieldId: linkField.id,
        lookupFieldId: detailFieldId,
      },
    });
    await apiUpdateRecord(host.id, hostRecordId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [linkField.id]: { id: foreignRecordId } } },
    });

    const readHost = async () => {
      const fields = await getFields(host.id);
      const rows = await apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        linkType: fields.find(
          (field: { id: string }) => field.id === linkField.id,
        )?.type,
        lookupType: fields.find(
          (field: { id: string }) => field.id === lookupField.id,
        )?.type,
        linkCell: rows.data.records[0]?.fields[linkField.id] ?? null,
        lookupCell: rows.data.records[0]?.fields[lookupField.id] ?? null,
      };
    };

    // Fixture verification, outside the checkpoint: the connection works
    // before anything is deleted. Restoring something that never worked would
    // prove nothing.
    const before = await readHost();
    if (
      before.linkType !== FieldType.Link ||
      before.lookupCell !== config.foreignDetail
    ) {
      throw new Error(
        `before the delete the host reads ${JSON.stringify(before)} - the fixture is not in place`,
      );
    }

    // Trash the table the ordinary way, then take it back out.
    const trashed = await axios.delete(
      urlBuilder(DELETE_TABLE, { baseId, tableId: foreign.id }),
      { validateStatus: () => true },
    );
    if (trashed.status < 200 || trashed.status >= 300) {
      throw new Error(
        `trashing ${foreign.id} answered ${trashed.status}: ${JSON.stringify(trashed.data)}`,
      );
    }
    const items = await apiGetTrashItems({
      resourceType: ResourceType.Base,
      resourceId: baseId,
    });
    const trashId =
      (items.data.trashItems ?? []).find(
        (item: { resourceId?: string }) => item.resourceId === foreign.id,
      )?.id ?? "";
    if (!trashId) {
      throw new Error(`${foreign.id} is not in the trash`);
    }

    const probe = await bugCheckpoint(
      "restoring-a-table-restores-the-columns-pointing-at-it",
      async () => {
        await apiRestoreTrash(trashId);

        const after = await readHost();
        if (after.linkType !== FieldType.Link) {
          throw new Error(
            `after restoring the table, the column pointing at it is ${JSON.stringify(after.linkType)} ` +
              "rather than a link - the table is back and the connection is not",
          );
        }
        if (
          JSON.stringify(after.linkCell) !== JSON.stringify(before.linkCell)
        ) {
          throw new Error(
            `after restoring the table, the link cell holds ${JSON.stringify(after.linkCell)}, expected ` +
              `${JSON.stringify(before.linkCell)}`,
          );
        }
        if (after.lookupCell !== config.foreignDetail) {
          throw new Error(
            `after restoring the table, the looked-up value reads ${JSON.stringify(after.lookupCell)}, ` +
              `expected ${JSON.stringify(config.foreignDetail)}`,
          );
        }
        return { after };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        hostAfterRestore: probe.after,
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
