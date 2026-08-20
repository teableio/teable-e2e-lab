import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  PASTE_URL,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { PasteNonCollaboratorUserCaseConfig } from "../types";

// A user field, and a member who exists on the platform but is not a
// collaborator of this base -> paste that member into the cell the way the
// grid does when a user cell is copied -> checkpoint: the paste lands.
//
// Write-path user resolution was narrowed to the base's collaborators, while
// the read path was left unscoped. The result is a table that displays a
// person it refuses to let you write: the column already shows them in the
// rows above, and copying that cell one row down answers
// 400 `User(usr...) not found in table`. Fill handle too.
//
// The distinction the fix restores is where the value came from. A structured
// user object copied out of a user field is not a typecast - the member is
// already identified, and existing on the platform is enough. Only free text
// is matched against collaborators, and text that matches nobody clears the
// cell the way v1 did rather than failing the request.
//
// The outsider is inserted with SQL because the product has no way to produce
// one on request: every user the API can attach to this base is, by
// construction, a collaborator of it. Real bases collected them through an
// earlier window when v2 accepted unscoped writes. The observation is the
// paste endpoint the grid itself calls.

const NAME_FIELD = "Name";
const USER_FIELD = "Assignee";

export const runPasteNonCollaboratorUserCase = async (
  bugCase: BugCaseFor<"paste-non-collaborator-user">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PasteNonCollaboratorUserCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  // Unique per run: the row is real platform state, and a leftover from an
  // earlier run must never be what a later one reads.
  const outsiderId = `usre2elab${context.runId}`.replace(/[^a-zA-Z0-9]/g, "");
  const outsiderEmail = `${outsiderId}@e2e-lab.invalid`;
  let tableId = "";
  let outsiderInserted = false;

  try {
    const db = fixtureDb(context.app);
    await db.execute(
      `INSERT INTO "users" ("id", "name", "email") VALUES ($1, $2, $3)
       ON CONFLICT ("id") DO NOTHING`,
      outsiderId,
      config.outsiderName,
      outsiderEmail,
    );
    outsiderInserted = true;

    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText },
        {
          name: USER_FIELD,
          type: FieldType.User,
          options: { isMultiple: false },
        },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    tableId = table.id;
    const userField = table.fields.find(
      (field: { name: string }) => field.name === USER_FIELD,
    );
    const userFieldIndex = table.fields.findIndex(
      (field: { name: string }) => field.name === USER_FIELD,
    );
    const viewId = table.views?.[0]?.id;
    const recordId = table.records[0]?.id;
    if (!userField || userFieldIndex < 0 || !viewId || !recordId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readUserCell = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        headers: response.headers,
        cell: response.data.records[0]?.fields?.[userField.id] as
          | { id?: string; title?: string }
          | undefined,
      };
    };

    // Fixture verification, outside the checkpoint: the row is there and the
    // cell is empty, so "the outsider landed" cannot be satisfied by something
    // that was already in it.
    const before = await readUserCell();
    const readRouting = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (before.cell !== undefined && before.cell !== null) {
      throw new Error(
        `the user cell already holds ${JSON.stringify(before.cell)} - the fixture is not in place`,
      );
    }

    // The paste the grid sends when a user cell is copied and the selection
    // was fully loaded: the structured user object, with `header` naming the
    // source column as a user field. That header is what tells the write path
    // this is a copied member rather than typed text.
    const pasteResponse = await axios.patch(
      urlBuilder(PASTE_URL, { tableId }),
      {
        viewId,
        ranges: [
          [userFieldIndex, 0],
          [userFieldIndex, 0],
        ],
        content: [
          [
            {
              id: outsiderId,
              title: config.outsiderName,
              email: outsiderEmail,
            },
          ],
        ],
        header: [userField],
      },
      { validateStatus: () => true },
    );
    const pasteStatus = pasteResponse.status;
    const pasteBody =
      typeof pasteResponse.data === "string"
        ? pasteResponse.data
        : JSON.stringify(pasteResponse.data ?? "");
    const pasteRouting = assertServedByV2(pasteResponse.headers, {
      operation: "PATCH /table/{tableId}/selection/paste",
      feature: "paste",
    });

    const probe = await bugCheckpoint(
      "non-collaborator-user-value-pastes",
      async () => {
        if (pasteStatus < 200 || pasteStatus >= 300) {
          throw new Error(
            `pasting a copied user cell answered ${pasteStatus}, expected it to land: ${pasteBody}`,
          );
        }
        // A 2xx that wrote nothing would be the same loss with a friendlier
        // status, so the cell is read back rather than trusted.
        const after = await readUserCell();
        if (after.cell?.id !== outsiderId) {
          throw new Error(
            `the paste answered ${pasteStatus} but the cell reads ${JSON.stringify(after.cell)}, expected the pasted member ${outsiderId}`,
          );
        }
        return { status: pasteStatus, cell: after.cell };
      },
    );

    return {
      details: {
        tableId,
        outsiderId,
        readRouting,
        pasteRouting,
        pasteStatus: probe.status,
        userCellAfter: probe.cell,
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
    if (outsiderInserted) {
      try {
        await fixtureDb(context.app).execute(
          `DELETE FROM "users" WHERE "id" = $1`,
          outsiderId,
        );
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (user ${outsiderId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
