import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createBase as apiCreateBase,
  deleteRecord as apiDeleteRecord,
  duplicateBase as apiDuplicateBase,
  getFields as apiGetFields,
  getRecords as apiGetRecords,
  getTableList as apiGetTableList,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  deleteBase,
  permanentDeleteBase,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CopiedOptionalLinkDeleteCaseConfig } from "../types";

// A base with an ordinary, optional link -> duplicate it -> delete a linked row
// in the copy -> checkpoint: the row goes, and the cell pointing at it empties.
//
// An optional link says "this row may point at one of those, or at none". Rows
// on the other side can be deleted; the cells pointing at them are cleared. A
// required link is the opposite and refuses the delete, which is the whole
// difference between the two settings.
//
// Copying a base rebuilt its links without that instruction, so every optional
// link in the copy behaved like a required one. In the copy - and only in the
// copy - rows could no longer be deleted, and the message said the row is still
// referenced by a required link. There is no required link; looking for one
// finds nothing, in any table.
//
// The same delete is done in the ORIGINAL base first, outside the checkpoint.
// That is what says the link is optional and the delete is meant to work, so a
// refusal in the copy is about the copying.

const NAME_FIELD = "Name";
const LINK_FIELD = "Item";

export const runCopiedOptionalLinkDeleteCase = async (
  bugCase: BugCaseFor<"copied-optional-link-delete">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CopiedOptionalLinkDeleteCaseConfig = bugCase.config;
  const spaceId = globalThis.testConfig.spaceId;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let sourceBaseId = "";
  let copyBaseId = "";

  try {
    const source = await apiCreateBase({ spaceId, name: `${suffix}-source` });
    sourceBaseId = source.data.id;

    const items = await createTable(sourceBaseId, {
      name: config.itemsTableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.itemNames.map((name) => ({
        fields: { [NAME_FIELD]: name },
      })),
    });
    const orders = await createTable(sourceBaseId, {
      name: config.ordersTableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.orderName } }],
    });
    // Optional on purpose: nothing here says the link must be filled in.
    const link = await createField(orders.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: items.id,
      },
    });
    const itemRows = items.records as {
      id: string;
      fields: Record<string, unknown>;
    }[];
    const orderRowId = orders.records?.[0]?.id as string;
    await apiUpdateRecord(orders.id, orderRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [link.id]: { id: itemRows[0]!.id } } },
    });

    // Fixture verification, outside the checkpoint: in the base as it was
    // built, deleting a linked row is allowed. That is what says the link is
    // optional - a required one refuses here too, and the case would be about
    // nothing.
    const inSource = await apiDeleteRecord(items.id, itemRows[1]!.id).catch(
      (error: unknown) => {
        throw new Error(
          `deleting a linked row in the base as built was refused (${
            error instanceof Error ? error.message : String(error)
          }) - the link is not optional, so the fixture is not in place`,
        );
      },
    );
    const routing = pickRoutingHeaders(inSource.headers);

    const duplicated = await apiDuplicateBase({
      fromBaseId: sourceBaseId,
      spaceId,
      name: `${suffix}-copy`,
      withRecords: true,
    });
    copyBaseId = duplicated.data.id;
    if (!copyBaseId) {
      throw new Error(
        `duplicating the base produced no copy: ${JSON.stringify(duplicated.data)}`,
      );
    }

    // Find the copy's own tables, which carry new ids.
    const copyTables = await apiGetTableList(copyBaseId);
    const copyItems = copyTables.data.find(
      (table: { name: string }) => table.name === config.itemsTableName,
    );
    const copyOrders = copyTables.data.find(
      (table: { name: string }) => table.name === config.ordersTableName,
    );
    if (!copyItems?.id || !copyOrders?.id) {
      throw new Error(
        `the copy does not carry both tables: ${JSON.stringify(copyTables.data.map((t: { name: string }) => t.name))}`,
      );
    }
    const copyLinkFieldId = (await apiGetFields(copyOrders.id)).data.find(
      (field: { name: string }) => field.name === LINK_FIELD,
    )?.id as string;
    const copyItemRows = await apiGetRecords(copyItems.id, {
      fieldKeyType: FieldKeyType.Id,
      take: config.itemNames.length,
    });
    const linkedCopyItem = copyItemRows.data.records.find(
      (record: { fields: Record<string, unknown> }) =>
        String(Object.values(record.fields)[0] ?? "") === config.itemNames[0],
    ) as { id: string } | undefined;
    if (!linkedCopyItem) {
      throw new Error(
        `the copy's items table does not carry ${JSON.stringify(config.itemNames[0])} - the copy has no rows to ` +
          "delete, so there is nothing to observe",
      );
    }

    const probe = await bugCheckpoint(
      "an-optional-link-survives-being-copied",
      async () => {
        const deleted = await apiDeleteRecord(
          copyItems.id,
          linkedCopyItem.id,
        ).catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(
            `deleting a linked row in the copied base was refused: ${message} - the link is optional and the same ` +
              "delete works in the base this was copied from, so the copy turned it into a required one, and the " +
              "message sends people looking for a required link that does not exist",
          );
        });

        // And the cell that pointed at it is empty, which is what an optional
        // link is supposed to do.
        const orderRows = await apiGetRecords(copyOrders.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 1,
        });
        const cell = orderRows.data.records[0]?.fields[copyLinkFieldId] ?? null;
        if (cell !== null && cell !== undefined) {
          throw new Error(
            `the row was deleted and the cell pointing at it still reads ${JSON.stringify(cell)}`,
          );
        }
        return { status: deleted.status };
      },
    );

    return {
      details: {
        sourceBaseId,
        copyBaseId,
        deleteStatus: probe.status,
        routing,
      },
    };
  } finally {
    for (const baseId of [copyBaseId, sourceBaseId]) {
      if (baseId) {
        try {
          await deleteBase(baseId);
          await permanentDeleteBase(baseId);
        } catch (error) {
          // Cleanup is the case's own housekeeping - the product did not fail.
          console.warn(
            `[e2e-lab] cleanup failed for ${bugCase.id} (base ${baseId}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }
};
