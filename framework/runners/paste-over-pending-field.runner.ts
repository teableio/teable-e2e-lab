import { FieldKeyType, FieldType, stringifyClipboardText } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  PASTE_BY_ID_URL,
  PASTE_URL,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { PasteOverPendingFieldCaseConfig } from "../types";

// A table carrying a field left marked pending, with no physical column behind
// it -> paste across a selection that spans it -> checkpoint: the paste lands
// on the ordinary columns beside it.
//
// A pending field is one the product has recorded but not finished
// provisioning. Ordinarily that state is transient, but bases carry fields
// stuck in it - a schema operation that died partway leaves the row marked
// pending and the physical column absent. Nothing in the grid says so: the
// column is drawn like any other.
//
// v2 asked the record write for every field in the selection, that one
// included, and the write reached for a column that is not there. The whole
// paste failed - the ordinary columns in the same selection included - so one
// leftover field made a region of the table unwritable.
//
// The fixture is built with SQL because there is no way to ask the product for
// a half-provisioned field: marking the row pending and dropping the column is
// exactly the state the failed schema operation leaves behind. See
// framework/fixture-db.ts.
//
// The two variants are the two paste requests the product actually sends: the
// grid's range paste, addressed by column position, and paste-by-id, addressed
// by field id. They go through different request handling, and the pending
// field sits in the middle of the selection either way.

const FIRST_FIELD = "First";
const LAST_FIELD = "Last";
const PENDING_FIELD = "Pending";
const ROW_TITLE = "the-row";

export const runPasteOverPendingFieldCase = async (
  bugCase: BugCaseFor<"paste-over-pending-field">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PasteOverPendingFieldCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.firstValue === config.lastValue) {
    throw new Error(
      "the two pasted values have to differ - equal values cannot tell a paste that landed on both columns " +
        "from one that landed on neither and left the fixture's own seed behind",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: FIRST_FIELD, type: FieldType.SingleLineText },
        { name: LAST_FIELD, type: FieldType.SingleLineText },
      ],
      records: [{ fields: { [FIRST_FIELD]: "seed", [LAST_FIELD]: "seed" } }],
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id;
    const recordId = table.records[0]?.id;
    const firstField = table.fields.find(
      (field: { name: string }) => field.name === FIRST_FIELD,
    );
    const lastField = table.fields.find(
      (field: { name: string }) => field.name === LAST_FIELD,
    );
    if (!viewId || !recordId || !firstField || !lastField) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // A formula over the first column: an ordinary computed field, provisioned
    // correctly, before the fixture breaks it.
    const pendingField = await createField(tableId, {
      name: PENDING_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${firstField.id}}` },
    });

    const db = fixtureDb(context.app);
    const { schema, table: physicalTable } = await db.physicalTable(tableId);
    const pendingColumn = await db.physicalColumn(pendingField.id);

    // The state a schema operation that died partway leaves: the field row
    // says pending, and the column it describes is gone.
    const marked = await db.execute(
      `UPDATE "field" SET "is_pending" = true WHERE "id" = $1`,
      pendingField.id,
    );
    if (marked !== 1) {
      throw new Error(
        `marking ${pendingField.id} pending touched ${marked} rows, expected 1`,
      );
    }
    await db.execute(
      `ALTER TABLE "${schema}"."${physicalTable}" DROP COLUMN "${pendingColumn}"`,
    );

    // Fixture verification, outside the checkpoint: the column really is gone.
    // If it were still there the paste would succeed on both sides of the fix
    // and the case would be reporting on nothing.
    const remaining = await db.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2 AND column_name = $3`,
      schema,
      physicalTable,
      pendingColumn,
    );
    if ((remaining[0]?.count ?? 0) !== 0) {
      throw new Error(
        `the physical column "${pendingColumn}" is still there - the fixture is not in place`,
      );
    }

    const content = stringifyClipboardText([
      config.paste === "byId"
        ? [config.firstValue, "ignored", config.lastValue]
        : [config.firstValue, config.lastValue, "ignored"],
    ]);

    // Raw axios with the status open: before the fix this request is refused,
    // and the generated client drops the response - routing headers and all -
    // the moment it is.
    const response =
      config.paste === "byId"
        ? await axios.patch(
            urlBuilder(PASTE_BY_ID_URL, { tableId }),
            {
              viewId,
              selection: {
                recordIds: [recordId],
                fieldIds: [firstField.id, pendingField.id, lastField.id],
              },
              projection: [firstField.id, pendingField.id, lastField.id],
              content,
              header: [],
            },
            { validateStatus: () => true },
          )
        : await axios.patch(
            urlBuilder(PASTE_URL, { tableId }),
            {
              viewId,
              // Columns 0..2 of the view: First, Last, and the pending field
              // appended by createField. The selection spans it either way.
              ranges: [
                [0, 0],
                [2, 0],
              ],
              content,
              header: [],
            },
            { validateStatus: () => true },
          );
    const status = response.status;
    const body =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data ?? "");
    const routing = assertServedByV2(response.headers, {
      operation:
        config.paste === "byId"
          ? "PATCH /table/{tableId}/selection/paste-by-id"
          : "PATCH /table/{tableId}/selection/paste",
      feature: "paste",
    });

    const probe = await bugCheckpoint(
      "paste-lands-beside-the-pending-field",
      async () => {
        if (status < 200 || status >= 300) {
          throw new Error(
            `pasting across a leftover pending field answered ${status}: ${body}`,
          );
        }
        // A 2xx that wrote nothing is the same loss with a friendlier status,
        // so the row is read back rather than trusted.
        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: 1,
        });
        const fields = after.data.records[0]?.fields ?? {};
        const landed = {
          first: String(fields[FIRST_FIELD] ?? ""),
          last: String(fields[LAST_FIELD] ?? ""),
        };
        if (
          landed.first !== config.firstValue ||
          landed.last !== config.lastValue
        ) {
          throw new Error(
            `the paste answered ${status} but the row reads ${JSON.stringify(landed)}, expected ` +
              `${JSON.stringify({ first: config.firstValue, last: config.lastValue })}`,
          );
        }
        return { status, landed };
      },
    );

    return {
      details: {
        tableId,
        paste: config.paste,
        pendingFieldId: pendingField.id,
        droppedColumn: pendingColumn,
        routing,
        pasteStatus: probe.status,
        rowAfter: probe.landed,
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
