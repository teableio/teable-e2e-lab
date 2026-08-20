import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  deleteTable as apiDeleteTable,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TableTrashInboundLinkCaseConfig } from "../types";

// A surviving table linking into a target table -> move the target table to
// the trash -> checkpoint: the inbound link field degrades to text.
//
// v1 detaches inbound links the moment a table is trashed. v2 deliberately did
// not: it kept the trashed table fully restorable and ran the cross-table
// cleanup only on permanent delete. What that left behind was a Link field
// pointing at a table nobody can read - the record editor rendered the link
// section blank and froze when asked to pick a record, and the fields only
// turned into text once someone emptied the trash. Restorability was bought
// with a table the user still has.
//
// The trashing itself is done outside the checkpoint, and its routing headers
// are what proves the engine: the bug is in v2's delete handler, so "some v2
// endpoint answered" is not the question - this DELETE has to be the v2 one.
// A delete that fails outright is re-thrown inside the checkpoint rather than
// here, because that is the product failing, not the fixture.
//
// The checkpoint asserts the field TYPE only, not the text left in the cell.
// v2 loses the cell value in the degrade (T6703, still open); asserting on it
// would make this case red for a bug it is not about.

const TARGET_NAME_FIELD = "Name";
const HOST_NAME_FIELD = "Name";
const LINK_FIELD = "Target";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const headersOf = (value: unknown): Record<string, unknown> | undefined => {
  const headers = (value as { headers?: unknown } | undefined)?.headers;
  return headers && typeof headers === "object"
    ? (headers as Record<string, unknown>)
    : undefined;
};

export const runTableTrashInboundLinkCase = async (
  bugCase: BugCaseFor<"table-trash-inbound-link">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TableTrashInboundLinkCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let targetTableId = "";
  let hostTableId = "";

  try {
    const targetTable = await createTable(baseId, {
      name: `${suffix}-target`,
      fields: [{ name: TARGET_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [TARGET_NAME_FIELD]: config.targetRowTitle } }],
    });
    targetTableId = targetTable.id;
    const targetRecordId = targetTable.records[0]?.id;
    if (!targetRecordId) {
      throw new Error(`Target table ${targetTableId} has no seeded row`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    hostTableId = hostTable.id;

    // Two-way: the symmetric field on the target table goes away with the
    // table, and the field left dangling on the surviving side is the one
    // under test.
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: targetTableId,
        relationship: Relationship.ManyOne,
        isOneWay: false,
      },
    });

    const created = await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [HOST_NAME_FIELD]: config.hostRowTitle,
            [LINK_FIELD]: { id: targetRecordId },
          },
        },
      ],
    });
    const hostRecordId = created.records[0]?.id;
    if (!hostRecordId) {
      throw new Error(`Host row was not created in ${hostTableId}`);
    }

    const readHostRow = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        headers: response.headers,
        cell: response.data.records[0]?.fields?.[linkField.id],
      };
    };

    // Fixture verification, outside the checkpoint: the link actually resolved
    // before anything was deleted. Without it, "the field never degraded"
    // could equally mean "there was nothing linked to degrade".
    const before = await readHostRow();
    const readRouting = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const linkedTitle = (before.cell as { title?: string } | undefined)?.title;
    if (linkedTitle !== config.targetRowTitle) {
      throw new Error(
        `the link cell reads ${JSON.stringify(before.cell)}, expected the target row titled "${config.targetRowTitle}" - the fixture is not in place`,
      );
    }

    // Trash, not permanent delete: the whole point is what the base looks like
    // while the table sits in the trash.
    let deleteError: unknown;
    let deleteHeaders: Record<string, unknown> | undefined;
    try {
      const response = await apiDeleteTable(baseId, targetTableId);
      deleteHeaders = headersOf(response);
    } catch (error) {
      deleteError = error;
      deleteHeaders = headersOf((error as { response?: unknown })?.response);
    }
    if (!deleteHeaders) {
      throw new Error(
        "DELETE /base/{baseId}/table/{tableId} returned no headers, so the engine that served it cannot be established",
      );
    }
    const deleteRouting = assertServedByV2(deleteHeaders, {
      operation: "DELETE /base/{baseId}/table/{tableId}",
      feature: "deleteTable",
    });

    const probe = await bugCheckpoint(
      "inbound-link-degrades-when-target-is-trashed",
      async () => {
        if (deleteError) {
          throw deleteError;
        }

        const deadline = Date.now() + config.settleTimeoutMs;
        let lastType: string | undefined;
        for (;;) {
          const fields = await getFields(hostTableId);
          const inbound = fields.find((field) => field.id === linkField.id);
          lastType = inbound?.type;
          if (lastType === FieldType.SingleLineText) {
            // The rest of the table has to have survived the degrade: a field
            // that converted by taking the record read down with it would be
            // a pass on the type check alone.
            const after = await readHostRow();
            return { type: lastType, cell: after.cell };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.settlePollIntervalMs);
        }

        throw new Error(
          `the inbound link field still reads type "${lastType}" after ${config.settleTimeoutMs}ms; trashing the target table left it pointing at a table nobody can open, expected "${FieldType.SingleLineText}"`,
        );
      },
    );

    return {
      details: {
        targetTableId,
        hostTableId,
        readRouting,
        deleteRouting,
        inboundLinkFieldId: linkField.id,
        typeAfterTrash: probe.type,
        cellAfterTrash: probe.cell,
      },
    };
  } finally {
    for (const tableId of [hostTableId, targetTableId]) {
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
