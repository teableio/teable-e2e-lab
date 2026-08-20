import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  deleteField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkDeleteReadableCaseConfig } from "../types";

// Two tables joined by a two-way oneOne link -> delete one side of it ->
// checkpoint: both tables still answer a record read.
//
// The physical foreign key of a oneOne link lives on the side the link was
// created from. The other side has no column of its own, and resolved its
// foreign key name to `__id` - the record id column of the FK host table. Its
// schema rules therefore aimed at `__id`: creating the link added a self-FK
// and a unique index on it, and deleting the link DROPPED it. Nothing about
// the delete failed; the table simply stopped being queryable afterwards,
// because every record read selects `__id`. Production met it as a 42703 from
// the comment-count endpoint (BACKEND-AI-1F8), but the endpoint is incidental
// - the whole table was gone as far as any read was concerned.
//
// So the observation is an ordinary record read, and the field delete sits
// inside the checkpoint with it: "deleting a link field breaks the table" is
// one event, and a delete that fails outright is as much the bug as a delete
// that quietly takes `__id` with it.

const HOST_NAME_FIELD = "Name";
const FOREIGN_NAME_FIELD = "Name";
const LINK_FIELD = "Pair";

export const runLinkDeleteReadableCase = async (
  bugCase: BugCaseFor<"link-delete-readable">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkDeleteReadableCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let hostTableId = "";
  let foreignTableId = "";

  try {
    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [HOST_NAME_FIELD]: config.hostRowTitle } }],
    });
    hostTableId = hostTable.id;
    const hostRecordId = hostTable.records[0]?.id;
    if (!hostRecordId) {
      throw new Error(`Host table ${hostTableId} has no seeded row`);
    }

    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [{ name: FOREIGN_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [FOREIGN_NAME_FIELD]: config.foreignRowTitle } }],
    });
    foreignTableId = foreignTable.id;
    const foreignRecordId = foreignTable.records[0]?.id;
    if (!foreignRecordId) {
      throw new Error(`Foreign table ${foreignTableId} has no seeded row`);
    }

    // Two-way on purpose: a one-way link has no second side, and the second
    // side is where the bug lives.
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.OneOne,
        isOneWay: false,
      },
    });
    const linkOptions = linkField.options as {
      symmetricFieldId?: string;
      fkHostTableName?: string;
    };
    const symmetricFieldId = linkOptions.symmetricFieldId;
    if (!symmetricFieldId) {
      throw new Error(
        "the two-way link did not produce a symmetric field - the fixture is not in place",
      );
    }
    // Which side hosts the foreign key is the premise of the whole case, so it
    // is checked rather than assumed: the side the link was created from owns
    // the physical column, and the symmetric side is the one with nothing of
    // its own to drop.
    if (!linkOptions.fkHostTableName?.includes(hostTableId)) {
      throw new Error(
        `the oneOne foreign key is hosted by ${linkOptions.fkHostTableName} rather than ${hostTableId} - the case is aimed at the wrong side`,
      );
    }

    const readTable = async (tableId: string) => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 10,
      });
      return {
        headers: response.headers,
        recordIds: response.data.records.map((record) => record.id),
      };
    };

    // Fixture verification, outside the checkpoint: both rows are readable
    // BEFORE the delete, and v2 is what answers the read the case depends on.
    const seededHost = await readTable(hostTableId);
    const routing = assertServedByV2(seededHost.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (!seededHost.recordIds.includes(hostRecordId)) {
      throw new Error(
        `the host row is not readable before the delete - the fixture is not in place`,
      );
    }

    const deletedFrom =
      config.deletedSide === "symmetric"
        ? { tableId: foreignTableId, fieldId: symmetricFieldId }
        : { tableId: hostTableId, fieldId: linkField.id };

    const probe = await bugCheckpoint(
      "tables-stay-readable-after-link-delete",
      async () => {
        await deleteField(deletedFrom.tableId, deletedFrom.fieldId);

        // The FK host table first: that is the one whose `__id` was dropped.
        const host = await readTable(hostTableId);
        if (!host.recordIds.includes(hostRecordId)) {
          throw new Error(
            `the host row disappeared after deleting the link: read back ${JSON.stringify(host.recordIds)}`,
          );
        }
        const foreign = await readTable(foreignTableId);
        if (!foreign.recordIds.includes(foreignRecordId)) {
          throw new Error(
            `the foreign row disappeared after deleting the link: read back ${JSON.stringify(foreign.recordIds)}`,
          );
        }
        return { host: host.recordIds, foreign: foreign.recordIds };
      },
    );

    return {
      details: {
        hostTableId,
        foreignTableId,
        routing,
        deletedSide: config.deletedSide,
        deletedFieldId: deletedFrom.fieldId,
        fkHostTableName: linkOptions.fkHostTableName,
        hostRecordIdsAfter: probe.host,
        foreignRecordIdsAfter: probe.foreign,
      },
    };
  } finally {
    for (const tableId of [hostTableId, foreignTableId]) {
      if (!tableId) {
        continue;
      }
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
