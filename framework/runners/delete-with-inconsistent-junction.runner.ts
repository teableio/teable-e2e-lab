import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  deleteRecords as apiDeleteRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeleteWithInconsistentJunctionCaseConfig } from "../types";

// A row on one side of a many-to-many link whose two records of that link
// disagree -> delete the row -> checkpoint: it is deleted, and the row on the
// other side is still there.
//
// A many-to-many link is kept in two places: a cell on each row, and a
// separate record of the pairing. They are written together and are supposed
// to agree. Bases that have been through imports, restores and older versions
// have rows where they do not - the pairing is recorded and one of the cells
// is blank.
//
// Deleting such a row was refused, with a message about a constraint. Nothing
// on screen explains it, because the thing being complained about is not
// something a person can see or reach: the row looks ordinary, the delete is
// ordinary, and it simply will not go. Trying from the other side does not
// help either.
//
// The disagreement is made with SQL: no request produces it, and a pair of
// rows that agree cannot show the difference.

const NAME_FIELD = "Name";
const LINK_FIELD = "Partners";

export const runDeleteWithInconsistentJunctionCase = async (
  bugCase: BugCaseFor<"delete-with-inconsistent-junction">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeleteWithInconsistentJunctionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const targets = await createTable(baseId, {
      name: `${suffix}-targets`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        { fields: { [NAME_FIELD]: config.deletedRowName } },
        { fields: { [NAME_FIELD]: config.keptRowName } },
      ],
    });
    createdTableIds.unshift(targets.id);
    const deletedRowId = targets.records?.[0]?.id;
    const keptRowId = targets.records?.[1]?.id;
    if (!deletedRowId || !keptRowId) {
      throw new Error("the target table is not in place");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowName } }],
    });
    createdTableIds.unshift(host.id);
    const hostRowId = host.records?.[0]?.id;
    if (!hostRowId) {
      throw new Error("the host table is not in place");
    }

    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: targets.id,
      },
    });
    await apiUpdateRecord(host.id, hostRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [link.id]: [{ id: deletedRowId }] } },
    });

    // The column the link put on the other table - one of the two places the
    // pairing is written down.
    const targetFields = await getFields(targets.id);
    const symmetric = targetFields.find(
      (field: { options?: { symmetricFieldId?: string } }) =>
        field.options?.symmetricFieldId === link.id,
    );
    if (!symmetric?.id) {
      throw new Error(
        "the link put no column on the other table, so there is only one place the pairing is written and no disagreement to make",
      );
    }

    // Fixture verification, outside the checkpoint: the pairing is in place on
    // both sides before it is broken.
    const before = await apiGetRecords(targets.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const pairedCell = before.data.records.find(
      (record: { id: string }) => record.id === deletedRowId,
    )?.fields[symmetric.id];
    const pairedCount = Array.isArray(pairedCell) ? pairedCell.length : 0;
    if (pairedCount !== 1) {
      throw new Error(
        `the row is paired with ${pairedCount} rows, expected 1 - the fixture is not in place`,
      );
    }

    // Setup: the two records of the pairing stop agreeing - the pairing itself
    // stays, the cell on this side goes blank.
    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(targets.id);
    const column = await db.physicalColumn(symmetric.id);
    await db.execute(
      `UPDATE "${physical.schema}"."${physical.table}" SET "${column}" = NULL WHERE "__id" = $1`,
      deletedRowId,
    );

    const probe = await bugCheckpoint(
      "a-row-whose-link-records-disagree-can-be-deleted",
      async () => {
        // A refused delete throws here, which is the report.
        await apiDeleteRecords(targets.id, [deletedRowId]);

        const after = await apiGetRecords(targets.id, {
          fieldKeyType: FieldKeyType.Name,
          take: 5,
        });
        const names = after.data.records
          .map((record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
          )
          .sort();
        if (names.includes(config.deletedRowName)) {
          throw new Error(
            `the row is still there after being deleted: the table holds [${names.join(", ")}]`,
          );
        }
        if (names.join(" ") !== config.keptRowName) {
          throw new Error(
            `the table holds [${names.join(", ")}], expected only ${config.keptRowName} - the delete took more than it was asked to`,
          );
        }
        return { names };
      },
    );

    return {
      details: {
        targetsTableId: targets.id,
        hostTableId: host.id,
        deletedRowId,
        rowsAfterDelete: probe.names,
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
