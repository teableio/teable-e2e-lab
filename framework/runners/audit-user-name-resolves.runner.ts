import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AuditUserNameResolvesCaseConfig } from "../types";

// Rows whose LastModifiedBy cell is stored the way older tables store it ->
// read them -> checkpoint: the cell carries the editor's NAME.
//
// v2's record-read hydration enriched public user cells but deliberately
// skipped `lastModifiedBy`. For a cell that carries its own stored snapshot
// that goes unnoticed, because the snapshot already holds a title. It shows up
// on cells that do not: a legacy cell holding nothing but the bare user id,
// and a NULL cell whose editor is only known from the system audit column.
// Both fell back to using the id as the display title, so the record card
// showed `usreOCcpI0QR2B2XLLr` where a person's name belongs.
//
// `CreatedBy` is read alongside as a control. It was never skipped, so it
// resolves the name for exactly the same stored shapes - which is what makes
// this a bug in one field's hydration rather than a limit of what the read
// path can know.
//
// The two storage shapes are written with SQL because they are history: today
// a modified row gets a full snapshot. What survives in older tables is what
// this case rebuilds.

const TITLE_FIELD = "Title";

type UserCell = { id?: string; title?: string; email?: string };

export const runAuditUserNameResolvesCase = async (
  bugCase: BugCaseFor<"audit-user-name-resolves">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AuditUserNameResolvesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const userId = globalThis.testConfig.userId;
  const userName = globalThis.testConfig.userName;
  const userEmail = globalThis.testConfig.email;
  let tableId = "";

  if (!userId || !userName) {
    throw new Error(
      "the seed user has no id or name - this case is about resolving that name",
    );
  }
  if (userName === userId) {
    throw new Error(
      "the seed user's name equals their id - the bug and the fix would look identical",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [{ name: TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    tableId = table.id;
    const titleField = table.fields.find(
      (field: { name: string }) => field.name === TITLE_FIELD,
    );
    if (!titleField) {
      throw new Error(`Table ${tableId} has no ${TITLE_FIELD} field`);
    }

    // The control first, so a failure to create it is a fixture problem rather
    // than a missing assertion later.
    const createdByField = await createField(tableId, {
      type: FieldType.CreatedBy,
      name: "Creator",
    });
    const lastModifiedByField = await createField(tableId, {
      type: FieldType.LastModifiedBy,
      name: "Editor",
    });

    const created = await createRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      typecast: false,
      records: [
        { fields: { [titleField.id]: config.legacyRowTitle } },
        { fields: { [titleField.id]: config.missingSnapshotRowTitle } },
      ],
    });
    const legacyRecordId = created.records[0]?.id;
    const missingSnapshotRecordId = created.records[1]?.id;
    if (!legacyRecordId || !missingSnapshotRecordId) {
      throw new Error(`Table ${tableId} did not get its two seeded rows`);
    }

    const readRows = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 10,
      });
      const byId = new Map(
        response.data.records.map((record) => [record.id, record.fields]),
      );
      return {
        headers: response.headers,
        legacy: byId.get(legacyRecordId) ?? {},
        missing: byId.get(missingSnapshotRecordId) ?? {},
      };
    };

    // Fixture verification, outside the checkpoint: both rows read back, and
    // v2 answered. Nothing is asserted about the cells yet - that is the
    // question this case exists to ask.
    const seeded = await readRows();
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    // The two historical shapes. A modified row gets a full snapshot today, so
    // neither of these is reachable through the API.
    const db = fixtureDb(context.app);
    const { schema, table: physicalTable } = await db.physicalTable(tableId);
    const column = await db.physicalColumn(lastModifiedByField.id);
    // A bare user id, stored as a JSON string rather than a snapshot object.
    const legacyWritten = await db.execute(
      `UPDATE "${schema}"."${physicalTable}" SET "${column}" = to_jsonb($1::text) WHERE "__id" = $2`,
      userId,
      legacyRecordId,
    );
    // No cell at all: the editor is only recoverable from the system audit
    // column that sits beside it.
    const missingWritten = await db.execute(
      `UPDATE "${schema}"."${physicalTable}" SET "${column}" = NULL WHERE "__id" = $1`,
      missingSnapshotRecordId,
    );
    if (legacyWritten !== 1 || missingWritten !== 1) {
      throw new Error(
        `the two storage shapes touched ${legacyWritten} and ${missingWritten} rows, expected 1 each - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "audit-user-cells-resolve-a-name",
      async () => {
        const rows = await readRows();
        const check = (label: string, cell: unknown) => {
          const user = cell as UserCell | undefined;
          if (!user || user.id !== userId) {
            throw new Error(
              `${label} does not identify the editor: ${JSON.stringify(cell)}`,
            );
          }
          if (user.title !== userName) {
            throw new Error(
              `${label} reads title ${JSON.stringify(user.title)}, expected the editor's name ${JSON.stringify(userName)}${
                user.title === userId
                  ? " (the raw user id was used as the display title)"
                  : ""
              }`,
            );
          }
        };

        // The control: CreatedBy was never skipped by the hydration, so if it
        // fails here the read path cannot resolve names at all and the case is
        // asking the wrong question.
        check(
          "the CreatedBy cell on the legacy row",
          rows.legacy[createdByField.id],
        );
        check(
          "the LastModifiedBy cell on the legacy row",
          rows.legacy[lastModifiedByField.id],
        );
        check(
          "the LastModifiedBy cell on the row with no snapshot",
          rows.missing[lastModifiedByField.id],
        );

        return {
          legacy: rows.legacy[lastModifiedByField.id],
          missing: rows.missing[lastModifiedByField.id],
        };
      },
    );

    return {
      details: {
        tableId,
        routing,
        userId,
        userName,
        userEmail,
        legacyCell: probe.legacy,
        missingSnapshotCell: probe.missing,
      },
    };
  } finally {
    if (tableId) {
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
