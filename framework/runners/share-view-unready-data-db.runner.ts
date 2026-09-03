import { FieldType } from "@teable/core";
import {
  axios,
  enableShareView as apiEnableShareView,
  createBase as apiCreateBase,
  createSpace as apiCreateSpace,
  deleteSpace,
  permanentDeleteSpace,
  SHARE_VIEW_GET,
  urlBuilder,
} from "@teable/openapi";
import { createTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ShareViewUnreadyDataDbCaseConfig } from "../types";

// A shared view in a space whose own database is not available -> open the
// share link -> checkpoint: the page is told the database is unavailable, not
// that something went wrong.
//
// Spaces can be bound to a customer's own database. That binding can be turned
// off - revoked credentials, a connection retired, a migration part way - and
// the space then has nowhere to read from. Everything about the share is still
// correct: the link, the view, the permission.
//
// What came back was an unhandled 500. To whoever holds the link - typically
// somebody outside the company, with no account and no way to ask anyone - a
// 500 says the product is broken and there is nothing to do but try again. A
// 503 naming an unavailable database says the same page will work later, and it
// says the same thing to whatever is watching the endpoint.
//
// So the assertion is the status AND the code. A 503 that arrived without
// saying why would be indistinguishable from any other outage, and the point of
// the fix is that this one is distinguishable.
//
// The binding is written with SQL because the API to bind a space to another
// database is not part of this observation, and a disabled connection is not
// something a request can ask for.

const NAME_FIELD = "Name";
const UNAVAILABLE_CODE = "database_connection_unavailable";

export const runShareViewUnreadyDataDbCase = async (
  bugCase: BugCaseFor<"share-view-unready-data-db">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ShareViewUnreadyDataDbCaseConfig = bugCase.config;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let spaceId = "";
  let connectionId = "";
  const db = fixtureDb(context.app);

  try {
    // Its own space: the binding under test is a property of a space, and this
    // must not touch the one every other case reads from.
    const space = await apiCreateSpace({ name: suffix });
    spaceId = space.data.id;
    const base = await apiCreateBase({ spaceId, name: `${suffix}-base` });
    const table = await createTable(base.data.id, {
      name: `${suffix}-table`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    const viewId = table.views?.[0]?.id;
    if (!viewId) {
      throw new Error(`the table ${table.id} has no view to share`);
    }

    const shared = await apiEnableShareView({ tableId: table.id, viewId });
    const shareId = shared.data?.shareId;
    if (!shareId) {
      throw new Error(
        `sharing the view returned no link: ${JSON.stringify(shared.data)}`,
      );
    }
    const routing = assertServedByV2(shared.headers, {
      operation: "POST /table/{tableId}/view/{viewId}/enable-share",
      feature: "enableViewShare",
    });

    // Fixture verification, outside the checkpoint: the link works while the
    // space still reads from the ordinary place. Without this, a 503 later
    // could just as well mean the share was never set up.
    const beforeBinding = await axios.get(
      urlBuilder(SHARE_VIEW_GET, { shareId }),
      { validateStatus: () => true },
    );
    if (beforeBinding.status !== 200) {
      throw new Error(
        `the share link answers ${beforeBinding.status} before the space is bound anywhere: ` +
          JSON.stringify(beforeBinding.data),
      );
    }

    // The state: the space is bound to a database whose connection is switched
    // off. Nothing about the share changes.
    connectionId = `e2elab${context.runId}`
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 24);
    await db.execute(
      `INSERT INTO "data_db_connection"
         ("id", "encrypted_url", "url_fingerprint", "internal_schema", "status", "created_by", "created_time")
       VALUES ($1, $2, $3, $4, 'disabled', 'e2e-lab', NOW())`,
      connectionId,
      config.encryptedUrlPlaceholder,
      `e2e-lab-${context.runId}`,
      "__teable_internal",
    );
    await db.execute(
      `INSERT INTO "space_data_db_binding"
         ("id", "space_id", "data_db_connection_id", "mode", "state", "created_by", "created_time")
       VALUES ($1, $2, $3, 'byodb', 'ready', 'e2e-lab', NOW())`,
      `${connectionId}b`,
      spaceId,
      connectionId,
    );

    const bound = await db.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM "space_data_db_binding" WHERE "space_id" = $1`,
      spaceId,
    );
    if ((bound[0]?.count ?? 0) !== 1) {
      throw new Error(
        `the space is bound to ${bound[0]?.count ?? 0} databases - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-share-link-whose-database-is-away-says-so",
      async () => {
        const response = await axios.get(
          urlBuilder(SHARE_VIEW_GET, { shareId }),
          { validateStatus: () => true },
        );
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data ?? "");
        const code = (response.data as { code?: string })?.code;

        if (response.status === 200) {
          throw new Error(
            `the share link answered 200 while the space's database is switched off: ${body}`,
          );
        }
        if (response.status !== 503) {
          throw new Error(
            `the share link answered ${response.status}, expected 503 - to whoever holds this link, ` +
              `anything else says the product is broken rather than that the page will work later. ` +
              `The response was ${body}`,
          );
        }
        if (code !== UNAVAILABLE_CODE) {
          throw new Error(
            `the share link answered 503 but called it ${JSON.stringify(code)}, expected ` +
              `${JSON.stringify(UNAVAILABLE_CODE)} - a 503 that does not say why is any other outage. ` +
              `The response was ${body}`,
          );
        }
        return { status: response.status, code };
      },
    );

    return {
      details: {
        spaceId,
        tableId: table.id,
        shareId,
        routing,
        ...probe,
      },
    };
  } finally {
    if (connectionId) {
      try {
        await db.execute(
          `DELETE FROM "space_data_db_binding" WHERE "space_id" = $1`,
          spaceId,
        );
        await db.execute(
          `DELETE FROM "data_db_connection" WHERE "id" = $1`,
          connectionId,
        );
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (binding ${connectionId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (spaceId) {
      try {
        await deleteSpace(spaceId);
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
