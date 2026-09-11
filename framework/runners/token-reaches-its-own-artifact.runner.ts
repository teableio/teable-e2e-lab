import { axios, urlBuilder } from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TokenReachesItsOwnArtifactCaseConfig } from "../types";

// Make a page with an API token -> ask for it back with the same token ->
// checkpoint: it comes back.
//
// A personal token is how anything outside the browser works with this product:
// scripts, the command line, another service. It is issued with a scope and a
// range - what it may do, and where - and the expectation is simple: inside
// that scope and range, it works.
//
// These pages could be created with a token and then not read with it. Every
// other request about the page - fetch it, list it, ask for its versions - was
// refused outright, so anything that made a page could not go back to it. The
// account owns the page; the token that made it cannot see it.
//
// The token here is scoped and ranged to the space the page lives in, so a
// refusal is about the route rather than about the token being too narrow. The
// page is created first, outside the checkpoint, with the same token: creation
// is what proves the token works at all, and it is the one request that was
// never refused.

const CREATE_ACCESS_TOKEN = "/access-token";
const CREATE_ARTIFACT = "/base/{baseId}/artifact";
const GET_ARTIFACT = "/artifact/{artifactId}";
const GET_ARTIFACT_VERSIONS = "/artifact/{artifactId}/versions";
const LIST_ARTIFACTS = "/artifact";

export const runTokenReachesItsOwnArtifactCase = async (
  bugCase: BugCaseFor<"token-reaches-its-own-artifact">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TokenReachesItsOwnArtifactCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const spaceId = globalThis.testConfig.spaceId;
  const apiUrl = `${context.appUrl}/api`;
  let tokenId = "";

  try {
    const expiredTime = new Date(Date.now() + config.tokenLifetimeMs)
      .toISOString()
      .slice(0, 10);
    const created = await axios.post<{ id: string; token: string }>(
      CREATE_ACCESS_TOKEN,
      {
        name: `${config.tokenNamePrefix}-${context.runId}`.slice(0, 40),
        scopes: config.scopes,
        spaceIds: [spaceId],
        expiredTime,
      },
      { validateStatus: () => true },
    );
    if (created.status < 200 || created.status >= 300 || !created.data?.token) {
      throw new Error(
        `issuing a token answered ${created.status}: ${JSON.stringify(created.data)}`,
      );
    }
    tokenId = created.data.id;
    const bearer = `Bearer ${created.data.token}`;

    const asToken = (path: string, init?: RequestInit) =>
      fetch(`${apiUrl}${path}`, {
        ...init,
        headers: {
          Authorization: bearer,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });

    // Fixture verification, outside the checkpoint: the token can make a page.
    // This is the one request that was never refused, and it is what says the
    // token is valid, in range, and allowed to be here at all.
    const madeResponse = await asToken(
      urlBuilder(CREATE_ARTIFACT, { baseId }),
      {
        method: "POST",
        body: JSON.stringify({
          name: `${config.artifactName}-${context.runId}`.slice(0, 60),
          type: config.artifactType,
          content: config.artifactContent,
        }),
      },
    );
    const made = (await madeResponse.json()) as { id?: string };
    if (!madeResponse.ok || !made.id) {
      throw new Error(
        `the token could not even make a page (${madeResponse.status}): ${JSON.stringify(made)} - the fixture is ` +
          "not in place",
      );
    }
    const artifactId = made.id;

    const probe = await bugCheckpoint(
      "a-token-can-read-back-what-it-made",
      async () => {
        const refused: { what: string; status: number; body: string }[] = [];
        const answers: Record<string, number> = {};
        for (const [what, path] of [
          ["the page itself", urlBuilder(GET_ARTIFACT, { artifactId })],
          ["its versions", urlBuilder(GET_ARTIFACT_VERSIONS, { artifactId })],
          ["the list of pages", LIST_ARTIFACTS],
        ] as const) {
          const response = await asToken(path);
          answers[what] = response.status;
          if (!response.ok) {
            refused.push({
              what,
              status: response.status,
              body: (await response.text()).slice(0, 160),
            });
          }
        }
        if (refused.length > 0) {
          throw new Error(
            `the token made the page and is refused ${JSON.stringify(refused)} - anything working outside the ` +
              "browser can create a page and never reach it again",
          );
        }
        return { answers };
      },
    );

    return {
      details: {
        artifactId,
        scopes: config.scopes,
        statuses: probe.answers,
        routing: pickRoutingHeaders(created.headers),
      },
    };
  } finally {
    if (tokenId) {
      try {
        await axios.delete(`${CREATE_ACCESS_TOKEN}/${tokenId}`, {
          validateStatus: () => true,
        });
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (token ${tokenId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
