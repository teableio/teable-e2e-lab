import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  deleteRecords as apiDeleteRecords,
  getRecords as apiGetRecords,
  DELETE_RECORDS_URL,
  urlBuilder,
} from "@teable/openapi";
import {
  createTable,
  deleteField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2, pickRoutingHeaders } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeleteCollateralCaseConfig } from "../types";

// Two ways a delete took more than it was asked for. Both variants live here
// because the shape is the same: delete something, then look at what was
// standing next to it.
//
// `sharedColumn` (T6619): two live fields can end up mapped to one physical
// column. A de-duplication race during concurrent field duplication produces
// it, and v2's ADD COLUMN IF NOT EXISTS hides the collision rather than
// failing on it. Deleting either field then dropped the column both of them
// name, so the surviving field lost every value it held and its metadata
// pointed at a column that is no longer there. Nothing in the product says
// which field is the dangerous one to delete, because from the grid they look
// like two ordinary columns.
//
//   The collision is written with SQL. There is no way to ask the product for
//   it - it is the outcome of a race - and re-enacting the race would be a
//   test of timing rather than of the delete. See framework/fixture-db.ts.
//
// `repeatedDelete` (T6586): deleting records that are already gone answered
// an error instead of doing nothing. A delete is the one operation a client
// retries most readily - a dropped response, a double click, a sync job
// replaying its queue - and the second attempt reporting failure makes a
// completed delete look like a broken one.

const NAME_FIELD = "Name";
const KEEPER_FIELD = "Keeper";
const DOOMED_FIELD = "Doomed";

export const runDeleteCollateralCase = async (
  bugCase: BugCaseFor<"delete-collateral">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeleteCollateralCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.rowCount < 1) {
    throw new Error("the fixture needs at least one row to say anything");
  }

  const rowTitles = Array.from(
    { length: config.rowCount },
    (_, index) => `row-${index}`,
  );

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: KEEPER_FIELD, type: FieldType.SingleLineText },
        { name: DOOMED_FIELD, type: FieldType.SingleLineText },
      ],
      records: rowTitles.map((title) => ({
        fields: {
          [NAME_FIELD]: title,
          [KEEPER_FIELD]: `${config.keptValuePrefix}-${title}`,
          [DOOMED_FIELD]: "doomed",
        },
      })),
    });
    tableId = table.id;
    const fieldId = (name: string) =>
      table.fields.find((field: { name: string }) => field.name === name)?.id;
    const keeperFieldId = fieldId(KEEPER_FIELD);
    const doomedFieldId = fieldId(DOOMED_FIELD);
    const recordIds = table.records.map((record: { id: string }) => record.id);
    if (
      !keeperFieldId ||
      !doomedFieldId ||
      recordIds.length !== config.rowCount
    ) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readKeeper = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: config.rowCount,
      });
      return {
        headers: response.headers,
        values: response.data.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[keeperFieldId] ?? ""),
        ),
      };
    };

    if (config.variant === "sharedColumn") {
      const db = fixtureDb(context.app);
      const keeperColumn = await db.physicalColumn(keeperFieldId);
      const doomedColumn = await db.physicalColumn(doomedFieldId);
      if (keeperColumn === doomedColumn) {
        throw new Error(
          "the two fields already share a physical column before the fixture wrote anything - " +
            "the case would be describing something it did not build",
        );
      }
      // The collision itself: the doomed field's metadata now names the
      // keeper's column. Both field rows are live, and the product cannot tell
      // them apart from two ordinary fields.
      const moved = await db.execute(
        `UPDATE "field" SET "db_field_name" = $1 WHERE "id" = $2`,
        keeperColumn,
        doomedFieldId,
      );
      if (moved !== 1) {
        throw new Error(
          `pointing ${doomedFieldId} at ${keeperColumn} touched ${moved} rows, expected 1`,
        );
      }

      // Fixture verification, outside the checkpoint: the keeper still reads
      // its values through the shared column. If it did not, "the keeper lost
      // its data" would already be true before the delete.
      const before = await readKeeper();
      const routing = assertServedByV2(before.headers, {
        operation: "GET /table/{tableId}/record",
        feature: "getRecords",
      });
      const expected = rowTitles.map(
        (title) => `${config.keptValuePrefix}-${title}`,
      );
      if (before.values.join("|") !== expected.join("|")) {
        throw new Error(
          `before the delete the keeper reads ${JSON.stringify(before.values)}, expected ` +
            `${JSON.stringify(expected)} - the fixture is not in place`,
        );
      }

      const probe = await bugCheckpoint(
        "deleting-one-field-leaves-the-other-intact",
        async () => {
          await deleteField(tableId, doomedFieldId);
          const after = await readKeeper();
          if (after.values.join("|") !== expected.join("|")) {
            throw new Error(
              `deleting "${DOOMED_FIELD}" left "${KEEPER_FIELD}" reading ${JSON.stringify(after.values)}, ` +
                `expected ${JSON.stringify(expected)} - the two shared a physical column and the drop took both`,
            );
          }
          return { after: after.values };
        },
      );

      // Recorded after the checkpoint, so a read that throws cannot be
      // mistaken for the bug: whether the column is still physically there.
      const columnStillThere = await db.query<{ count: number }[]>(
        `SELECT COUNT(*)::int AS count FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
        (await db.physicalTable(tableId)).schema,
        (await db.physicalTable(tableId)).table,
        keeperColumn,
      );

      return {
        details: {
          tableId,
          variant: config.variant,
          routing,
          sharedColumn: keeperColumn,
          keeperAfterDelete: probe.after,
          sharedColumnStillPresent: (columnStillThere[0]?.count ?? 0) > 0,
        },
      };
    }

    // ---- repeatedDelete --------------------------------------------------
    const first = await apiDeleteRecords(tableId, recordIds);
    const firstRouting = pickRoutingHeaders(first.headers);

    // Fixture verification, outside the checkpoint: the rows really are gone,
    // so the second delete is genuinely a repeat rather than the first one
    // that lands.
    const remaining = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      take: config.rowCount,
    });
    if (remaining.data.records.length !== 0) {
      throw new Error(
        `${remaining.data.records.length} rows survived the first delete - the second one would not be a repeat`,
      );
    }

    // Raw axios with the status open: before the fix this request is refused,
    // and the generated client drops the response - routing headers included -
    // the moment it is.
    const second = await axios.delete(
      urlBuilder(DELETE_RECORDS_URL, { tableId }),
      {
        params: { recordIds },
        validateStatus: () => true,
      },
    );
    const secondRouting = pickRoutingHeaders(second.headers);
    const secondBody =
      typeof second.data === "string"
        ? second.data
        : JSON.stringify(second.data ?? "");

    const probe = await bugCheckpoint(
      "deleting-already-deleted-records-is-a-no-op",
      async () => {
        if (second.status < 200 || second.status >= 300) {
          throw new Error(
            `deleting ${recordIds.length} already-deleted record(s) answered ${second.status}: ${secondBody} - ` +
              "a retried delete reports the completed delete as a failure",
          );
        }
        return { status: second.status };
      },
    );

    return {
      details: {
        tableId,
        variant: config.variant,
        rowCount: config.rowCount,
        firstDeleteStatus: first.status,
        firstRouting,
        secondDeleteStatus: probe.status,
        secondRouting,
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
