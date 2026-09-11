import { FieldType, ViewType } from "@teable/core";
import type { IEnableShareViewVo } from "@teable/openapi";
import { axios, urlBuilder } from "@teable/openapi";
import {
  createTable,
  createView,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormSubmitFlagCannotBrickCaseConfig } from "../types";

// A shared form -> write a flag into its share settings that no screen offers
// -> checkpoint: the form still takes submissions.
//
// A form's whole purpose is that strangers can fill it in. Whether it accepts
// submissions was kept as a stored flag alongside the fact that the view is a
// form - two places saying the same thing, and one of them writable by anybody
// who can reach the settings endpoint: another tool, a script, an assistant
// tidying up.
//
// Set to false, the form stops accepting anything. There is no screen that
// shows the flag and none that turns it back on, so the owner sees a form that
// is shared, looks fine, and silently refuses everybody. The fix removes the
// flag: whether a form takes submissions follows from it being a form.
//
// The submission is made without a session, the way somebody filling in a
// public form has none.

const NAME_FIELD = "Name";
const VIEW_SHARE_META = "/table/{tableId}/view/{viewId}/share-meta";
const ENABLE_SHARE_VIEW = "/table/{tableId}/view/{viewId}/enable-share";
const SHARE_VIEW_FORM_SUBMIT = "/share/{shareId}/view/form-submit";

export const runFormSubmitFlagCannotBrickCase = async (
  bugCase: BugCaseFor<"form-submit-flag-cannot-brick">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormSubmitFlagCannotBrickCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const apiUrl = `${context.appUrl}/api`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableId = table.id;
    const form = await createView(tableId, {
      name: "Shared form",
      type: ViewType.Form,
    });
    const shared = await axios.post<IEnableShareViewVo>(
      urlBuilder(ENABLE_SHARE_VIEW, { tableId, viewId: form.id }),
      {},
      { validateStatus: () => true },
    );
    if (shared.status < 200 || shared.status >= 300 || !shared.data?.shareId) {
      throw new Error(
        `sharing the form answered ${shared.status}: ${JSON.stringify(shared.data)}`,
      );
    }
    const shareId = shared.data.shareId;

    const submitAsAStranger = (value: string) =>
      fetch(`${apiUrl}${urlBuilder(SHARE_VIEW_FORM_SUBMIT, { shareId })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { [NAME_FIELD]: value } }),
      });

    // Fixture verification, outside the checkpoint: somebody with no account
    // can fill the form in before anything is written to its settings. Without
    // this, a refusal afterwards could be about the form never having worked.
    const firstTry = await submitAsAStranger(config.beforeValue);
    if (!firstTry.ok) {
      throw new Error(
        `a stranger cannot fill the form in even before the flag is written (${firstTry.status}): ` +
          `${(await firstTry.text()).slice(0, 160)} - the fixture is not in place`,
      );
    }

    // The flag, written through the endpoint that accepts it. No screen offers
    // this; a tool or a script does.
    const wrote = await axios.put(
      urlBuilder(VIEW_SHARE_META, { tableId, viewId: form.id }),
      { submit: { allow: false } },
      { validateStatus: () => true },
    );
    const routing = pickRoutingHeaders(wrote.headers);

    const probe = await bugCheckpoint(
      "a-shared-form-keeps-taking-submissions",
      async () => {
        const secondTry = await submitAsAStranger(config.afterValue);
        if (!secondTry.ok) {
          throw new Error(
            `after a flag no screen offers was written to the form's share settings (that write answered ` +
              `${wrote.status}), filling the form in answers ${secondTry.status}: ` +
              `${(await secondTry.text()).slice(0, 200)} - the form is shared, looks fine, and refuses everybody, ` +
              "and there is no setting to turn back on",
          );
        }
        return { status: secondTry.status, shareMetaWrite: wrote.status };
      },
    );

    return {
      details: {
        tableId,
        shareId,
        shareMetaWriteStatus: probe.shareMetaWrite,
        submitStatus: probe.status,
        routing,
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
