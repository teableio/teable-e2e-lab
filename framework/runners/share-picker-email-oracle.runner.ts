import { FieldType, ViewType } from "@teable/core";
import type {
  IEnableShareViewVo,
  IShareViewCollaboratorsVo,
} from "@teable/openapi";
import {
  axios,
  ENABLE_SHARE_VIEW,
  SHARE_VIEW_COLLABORATORS,
  urlBuilder,
  USER_ME,
} from "@teable/openapi";
import {
  createTable,
  createView,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SharePickerEmailOracleCaseConfig } from "../types";

// A shared form with a people column -> type somebody's full email address into
// its picker -> checkpoint: nobody comes back.
//
// A shared form is a link anybody can open: no account, no membership, often
// posted publicly. The picker on a people column is there so whoever fills the
// form can pick the person it is about, by name.
//
// It searched email addresses too. That turns the link into two things nobody
// meant to publish: a way to check whether a given address belongs to this
// organisation - type it in, see if a person appears - and, address by address,
// a way to enumerate who works there. Neither needs an account, and nothing
// about it looks like an attack: it is the form's own search box.
//
// The case searches for the full address of somebody who genuinely is a
// collaborator, so an empty answer means the address is not being matched
// rather than that the person is not there. Searching by their name is the
// control, taken first: it must find them, or an empty answer would only mean
// the picker is broken.

const TITLE_FIELD = "Title";
const PEOPLE_FIELD = "Owner";

export const runSharePickerEmailOracleCase = async (
  bugCase: BugCaseFor<"share-picker-email-oracle">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SharePickerEmailOracleCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const me = await axios.get<{ id: string; name: string; email: string }>(
      USER_ME,
    );
    const owner = me.data;
    if (!owner.email || !owner.email.includes("@")) {
      throw new Error(
        `the signed-in person has no email address (${JSON.stringify(owner.email)}) - there is nothing to search for`,
      );
    }

    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: PEOPLE_FIELD, type: FieldType.User },
      ],
      records: [],
    });
    tableId = table.id;
    const form = await createView(tableId, {
      name: "Shared form",
      type: ViewType.Form,
    });
    const share = await axios.post<IEnableShareViewVo>(
      urlBuilder(ENABLE_SHARE_VIEW, { tableId, viewId: form.id }),
    );
    const shareId = share.data.shareId;

    const searchPicker = (search: string) =>
      axios.get<IShareViewCollaboratorsVo>(
        urlBuilder(SHARE_VIEW_COLLABORATORS, { shareId }),
        { params: { search, take: 50 }, validateStatus: () => true },
      );

    // Fixture verification, outside the checkpoint: the picker works, and it
    // finds this person by name. Without it, an empty answer to the email
    // search would only mean the picker is broken or the person is not a
    // collaborator - and the case would report a leak as closed for the wrong
    // reason.
    const byName = await searchPicker(owner.name);
    if (byName.status !== 200) {
      throw new Error(
        `the shared picker answered ${byName.status}: ${JSON.stringify(byName.data)}`,
      );
    }
    assertServedByV2(byName.headers, {
      operation: "GET /share/{shareId}/view/collaborators",
      feature: "getShareViewCollaborators",
    });
    if (
      !byName.data.some(
        (candidate: { userId?: string }) => candidate.userId === owner.id,
      )
    ) {
      throw new Error(
        `searching the shared picker for ${JSON.stringify(owner.name)} did not find the person who owns this ` +
          `base: ${JSON.stringify(byName.data)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-shared-picker-does-not-answer-to-an-email-address",
      async () => {
        const byEmail = await searchPicker(owner.email);
        if (byEmail.status !== 200) {
          throw new Error(
            `the shared picker answered ${byEmail.status} to an email search: ${JSON.stringify(byEmail.data)}`,
          );
        }
        if (byEmail.data.length > 0) {
          throw new Error(
            `typing a full email address into a shared form's picker returned ` +
              `${JSON.stringify(byEmail.data)} - anybody holding the link can check whether an address belongs to ` +
              "this organisation, one address at a time",
          );
        }
        // The addresses themselves must not ride along on the answers the
        // picker does give, which is the other half of the same leak.
        const withEmail = byName.data.filter(
          (candidate: Record<string, unknown>) => "email" in candidate,
        );
        if (withEmail.length > 0) {
          throw new Error(
            `the shared picker returned email addresses: ${JSON.stringify(withEmail)}`,
          );
        }
        return { matchesForEmail: byEmail.data.length };
      },
    );

    return {
      details: {
        tableId,
        shareId,
        matchesForName: byName.data.length,
        matchesForEmail: probe.matchesForEmail,
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
