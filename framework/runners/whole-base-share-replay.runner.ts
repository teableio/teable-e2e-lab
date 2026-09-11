import { FieldType } from "@teable/core";
import { axios, createBase, urlBuilder } from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteBase } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { WholeBaseShareReplayCaseConfig } from "../types";

// A share link for one whole base -> present it against a DIFFERENT base ->
// checkpoint: refused.
//
// Sharing a whole base hands out a link, and the link is a header the browser
// sends with every request it makes while the shared base is open. Which base
// the request is for is a separate part of that request.
//
// For whole-base shares the two were never compared. Anybody holding any such
// link could put somebody else's base id in the request and be answered: read
// its structure, and export it. Nothing about that needs a share on the victim
// base, or membership of it, or anything beyond one valid link of one's own -
// which is what makes it a tenant boundary rather than a permission slip.
//
// The person here is freshly signed up per run. Reusing a shared identity would
// eventually make them a collaborator somewhere by accident, and a legitimate
// answer would read as the leak.
//
// Their own base is asked for first, outside the checkpoint: the link has to
// work where it is meant to, or a refusal afterwards says nothing about which
// base was asked for.

const BASE_SHARE_HEADER = "X-Tea-Base-Share";
const CREATE_BASE_SHARE = "/base/{baseId}/share";
const UPDATE_BASE_SHARE = "/base/{baseId}/share/{shareId}";
const GET_BASE_NODE_LIST = "/base/{baseId}/node/list";
const EXPORT_BASE = "/base/{baseId}/export";

export const runWholeBaseShareReplayCase = async (
  bugCase: BugCaseFor<"whole-base-share-replay">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: WholeBaseShareReplayCaseConfig = bugCase.config;
  const spaceId = globalThis.testConfig.spaceId;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let sharedBaseId = "";
  let victimBaseId = "";

  try {
    const shared = await createBase({ spaceId, name: `${suffix}-shared` });
    sharedBaseId = shared.data.id;
    const victim = await createBase({ spaceId, name: `${suffix}-victim` });
    victimBaseId = victim.data.id;
    // Something to find in it. An empty base answers an unauthorised request
    // with an empty list, which is the same leak and reads like nothing
    // happened; a table means the answer names something that belongs to
    // somebody else.
    await createTable(victimBaseId, {
      name: config.victimTableName,
      fields: [
        { name: "Title", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { Title: config.victimRowTitle } }],
    });

    const share = await axios.post<{ shareId: string }>(
      urlBuilder(CREATE_BASE_SHARE, { baseId: sharedBaseId }),
      {},
      { validateStatus: () => true },
    );
    if (share.status < 200 || share.status >= 300 || !share.data?.shareId) {
      throw new Error(
        `sharing the whole base answered ${share.status}: ${JSON.stringify(share.data)}`,
      );
    }
    const shareId = share.data.shareId;
    await axios.patch(
      urlBuilder(UPDATE_BASE_SHARE, { baseId: sharedBaseId, shareId }),
      { allowEdit: true },
      { validateStatus: () => true },
    );

    // Somebody with an account and nothing else: signed up fresh for this run,
    // so they are a member of neither base.
    const holder = await createNewUserAxios({
      email: `e2e-lab-share-replay-${context.runId}@example.com`,
      password: config.password,
    });

    const askWith = (client: typeof holder, url: string, baseId: string) =>
      client.get(urlBuilder(url, { baseId }), {
        headers: { [BASE_SHARE_HEADER]: shareId },
        validateStatus: () => true,
      });

    // Fixture verification, outside the checkpoint: the link works where it is
    // meant to. Without this, a refusal below could mean the link was never
    // honoured at all and the case would report a closed door that was never
    // open.
    const ownBase = await askWith(holder, GET_BASE_NODE_LIST, sharedBaseId);
    if (ownBase.status !== 200) {
      throw new Error(
        `the share link does not open the base it was made for (${ownBase.status}): ${JSON.stringify(ownBase.data)} - ` +
          "the fixture is not in place",
      );
    }
    const routing = pickRoutingHeaders(ownBase.headers);

    const probe = await bugCheckpoint(
      "a-share-link-only-opens-the-base-it-was-made-for",
      async () => {
        const answers: { what: string; status: number; body: string }[] = [];
        for (const [what, url] of [
          ["the list of what is in it", GET_BASE_NODE_LIST],
          ["an export of the whole thing", EXPORT_BASE],
        ] as const) {
          const response = await askWith(holder, url, victimBaseId);
          answers.push({
            what,
            status: response.status,
            body: JSON.stringify(response.data ?? "").slice(0, 160),
          });
        }
        const allowed = answers.filter(
          (answer) => answer.status >= 200 && answer.status < 300,
        );
        if (allowed.length > 0) {
          throw new Error(
            `a share link for one base answered for another one: ${JSON.stringify(allowed)} - anybody holding any ` +
              "whole-base link can read and export a base they have nothing to do with",
          );
        }
        const unexpected = answers.filter(
          (answer) => answer.status !== config.expectedStatus,
        );
        if (unexpected.length > 0) {
          throw new Error(
            `the requests were refused, but not the way this case expects (${config.expectedStatus}): ` +
              JSON.stringify(unexpected),
          );
        }
        return { answers };
      },
    );

    return {
      details: {
        sharedBaseId,
        victimBaseId,
        shareId,
        routing,
        answers: probe.answers,
      },
    };
  } finally {
    for (const baseId of [victimBaseId, sharedBaseId]) {
      if (baseId) {
        try {
          await permanentDeleteBase(baseId);
        } catch (error) {
          // Cleanup is the case's own housekeeping - the product did not fail.
          console.warn(
            `[e2e-lab] cleanup failed for ${bugCase.id} (base ${baseId}): ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }
};
