import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  deleteRecords as apiDeleteRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { IncomingLinkCleanupCaseConfig } from "../types";

// A row that other rows point at -> delete it -> checkpoint: the cells that
// pointed at it are empty.
//
// Deleting a row has to clear it out of every cell that referred to it. The
// clearing looked at link columns by a piece of their stored shape, and link
// columns written by an older version of the product carry that shape
// differently - so those columns were skipped.
//
// What is left is a link cell naming a row that is not there: it still shows a
// name, filters still count it, and opening it finds nothing. The table that
// was cleaned up looks clean, and the damage is on a different table entirely,
// which is why nobody connects the two.
//
// The older shape is written with SQL. It is not a state the product produces
// now, and nothing in the product distinguishes a column that carries it.

const NAME_FIELD = "Name";
const LINK_FIELD = "Project";

export const runIncomingLinkCleanupCase = async (
  bugCase: BugCaseFor<"incoming-link-cleanup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: IncomingLinkCleanupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    // The table that gets a row deleted.
    const target = await createTable(baseId, {
      name: `${suffix}-target`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [NAME_FIELD]: config.deletedRowTitle } },
        { fields: { [NAME_FIELD]: config.keptRowTitle } },
      ],
    });
    createdTableIds.unshift(target.id);
    const doomedId = target.records[0]?.id;
    const keptId = target.records[1]?.id;

    // The table that points at it.
    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [NAME_FIELD]: config.pointingRowTitle } },
        { fields: { [NAME_FIELD]: config.otherRowTitle } },
      ],
    });
    createdTableIds.unshift(host.id);
    const pointingId = host.records[0]?.id;
    const otherId = host.records[1]?.id;
    if (!doomedId || !keptId || !pointingId || !otherId) {
      throw new Error("the fixture tables are not in place");
    }

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: target.id,
        isOneWay: true,
      },
    });

    await apiUpdateRecord(host.id, pointingId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [linkField.id]: { id: doomedId } } },
    });
    // A second row pointing at the row that survives: the delete has to leave
    // that one alone.
    await apiUpdateRecord(host.id, otherId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [linkField.id]: { id: keptId } } },
    });

    // Setup, outside the checkpoint: give the link column the stored shape a
    // column written by an older version carries.
    const db = fixtureDb(context.app);
    await db.execute(
      `UPDATE "field" SET "is_lookup" = false WHERE "id" = $1`,
      linkField.id,
    );

    const readLinks = async () => {
      const read = await apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Name,
        take: 2,
      });
      return Object.fromEntries(
        read.data.records.map((record: { fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD] ?? ""),
          (record.fields[LINK_FIELD] as { title?: unknown } | undefined)
            ?.title ?? null,
        ]),
      ) as Record<string, unknown>;
    };

    // Fixture verification, outside the checkpoint: both cells really point at
    // something. Clearing a cell that was already empty would pass anywhere.
    const before = await readLinks();
    if (
      before[config.pointingRowTitle] !== config.deletedRowTitle ||
      before[config.otherRowTitle] !== config.keptRowTitle
    ) {
      throw new Error(
        `before the delete the link cells read ${JSON.stringify(before)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "deleting-a-row-empties-the-cells-that-pointed-at-it",
      async () => {
        await apiDeleteRecords(target.id, [doomedId]);

        const after = await readLinks();
        if (after[config.pointingRowTitle] !== null) {
          throw new Error(
            `after deleting ${config.deletedRowTitle} the cell in ${config.pointingRowTitle} still reads ` +
              `${JSON.stringify(after[config.pointingRowTitle])} - it names a row that is not there`,
          );
        }
        // The other half: the delete must not clear cells pointing elsewhere.
        if (after[config.otherRowTitle] !== config.keptRowTitle) {
          throw new Error(
            `deleting ${config.deletedRowTitle} also cleared the cell pointing at ${config.keptRowTitle}: ` +
              JSON.stringify(after),
          );
        }
        return { after };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        targetTableId: target.id,
        linkFieldId: linkField.id,
        linksAfter: probe.after,
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
