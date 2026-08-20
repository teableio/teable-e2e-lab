import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  DELETE_TABLE,
  axios,
  getRecords as apiGetRecords,
  urlBuilder,
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
import { fixtureDb } from "../fixture-db";
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
//
// `dropLinkDisplayColumn` runs the same shape over a host whose link column
// was never provisioned - metadata describing a column the table does not
// have, which a base accumulates through a failed schema operation rather than
// through anything a user can type. The conversion renamed that column
// unconditionally, so the whole schema update failed and the host kept a Link
// field pointing at a table nobody can open. The drop happens after the
// fixture read and before the delete, in that order: reading the link first is
// what proves there was something to degrade, and it is the last moment the
// row can be read at all.

const TARGET_NAME_FIELD = "Name";
const HOST_NAME_FIELD = "Name";
const LINK_FIELD = "Target";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

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
        relationship:
          config.relationship === "oneMany"
            ? Relationship.OneMany
            : Relationship.ManyOne,
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
            [LINK_FIELD]:
              config.relationship === "oneMany"
                ? [{ id: targetRecordId }]
                : { id: targetRecordId },
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
    const linkedCell = before.cell as
      | { title?: string }
      | { title?: string }[]
      | undefined;
    const linkedTitle = (Array.isArray(linkedCell) ? linkedCell[0] : linkedCell)
      ?.title;
    if (linkedTitle !== config.targetRowTitle) {
      throw new Error(
        `the link cell reads ${JSON.stringify(before.cell)}, expected the target row titled "${config.targetRowTitle}" - the fixture is not in place`,
      );
    }

    // The missing-column fixture, written through the database because no API
    // asks for a column to be taken away. Setup only, and outside the
    // checkpoint - fixture-db throws if it is ever reached from inside one.
    let droppedColumn: string | undefined;
    if (config.dropLinkDisplayColumn) {
      const db = fixtureDb(context.app);
      const { schema, table } = await db.physicalTable(hostTableId);
      droppedColumn = await db.physicalColumn(linkField.id);
      const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;
      await db.execute(
        `ALTER TABLE ${quoted(schema)}.${quoted(table)} DROP COLUMN IF EXISTS ${quoted(droppedColumn)}`,
      );
      // The drop has to have happened, or the case silently becomes a second
      // copy of its sibling and reports green for the wrong reason.
      const remaining = await db.query<{ count: bigint | number }[]>(
        `SELECT COUNT(*)::int AS count FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        schema,
        table,
        droppedColumn,
      );
      if (Number(remaining[0]?.count ?? 0) !== 0) {
        throw new Error(
          `column ${droppedColumn} is still on ${schema}.${table} - the missing-column fixture is not in place, so this case would only repeat its sibling`,
        );
      }
    }

    // Trash, not permanent delete: the whole point is what the base looks like
    // while the table sits in the trash.
    //
    // Raw axios with the status left open, because this delete is allowed to
    // be refused - on the missing-column variant it was, before the fix - and
    // the generated client throws away the whole response, routing headers
    // included, the moment a request answers non-2xx. Losing them here would
    // report "the engine could not be established" for a delete the product
    // had just answered, turning a reproduction into a broken case.
    const deleteResponse = await axios.delete(
      urlBuilder(DELETE_TABLE, { baseId, tableId: targetTableId }),
      { validateStatus: () => true },
    );
    const deleteRouting = assertServedByV2(deleteResponse.headers, {
      operation: "DELETE /base/{baseId}/table/{tableId}",
      feature: "deleteTable",
    });

    const probe = await bugCheckpoint(
      "inbound-link-degrades-when-target-is-trashed",
      async () => {
        // A refused delete is the product failing, not the fixture, so it is
        // raised in here where it reads as the bug rather than as an error.
        if (deleteResponse.status >= 300) {
          throw new Error(
            `DELETE /base/{baseId}/table/{tableId} answered ${deleteResponse.status}: ` +
              `${typeof deleteResponse.data === "string" ? deleteResponse.data : JSON.stringify(deleteResponse.data)}`,
          );
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
        relationship: config.relationship,
        droppedColumn: droppedColumn ?? null,
        deleteStatus: deleteResponse.status,
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
