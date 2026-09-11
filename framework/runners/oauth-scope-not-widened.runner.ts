import { axios } from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { OauthScopeNotWidenedCaseConfig } from "../types";

// Approve an app for one narrow thing -> use its token for something else ->
// checkpoint: refused.
//
// Connecting an app shows a list of what it is asking for, and approving is
// meant to grant that list and nothing more. That list is the whole of what a
// person is agreeing to, and it is the only thing they see.
//
// One permission was added to every token regardless: the ability to list every
// base the approving person can reach. An app approved for reading one table
// could enumerate the whole account's bases. Nothing in the approval screen said
// so, and nothing afterwards shows it either.
//
// The token is used the way a real app uses it: a bare HTTP client with no
// session, carrying only the bearer token. Using the lab's signed-in client
// would prove nothing, because that session can list bases on its own.
//
// The token is exercised inside its own scope first, outside the checkpoint. A
// token that does not work at all would be refused everywhere, and the refusal
// this case is about would mean nothing.

const OAUTH_CLIENT = "/oauth/client";

export const runOauthScopeNotWidenedCase = async (
  bugCase: BugCaseFor<"oauth-scope-not-widened">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: OauthScopeNotWidenedCaseConfig = bugCase.config;
  const apiUrl = `${context.appUrl}/api`;
  let clientId = "";

  const formPost = async (path: string, body: Record<string, string>) =>
    fetch(`${apiUrl}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });

  try {
    const created = await axios.post<{
      clientId: string;
      redirectUris: string[];
      scopes: string[];
    }>(
      OAUTH_CLIENT,
      {
        name: config.appName,
        redirectUris: [config.redirectUri],
        homepage: config.homepage,
        scopes: [config.consentedScope],
      },
      { validateStatus: () => true },
    );
    if (
      created.status < 200 ||
      created.status >= 300 ||
      !created.data?.clientId
    ) {
      throw new Error(
        `registering the app answered ${created.status}: ${JSON.stringify(created.data)}`,
      );
    }
    clientId = created.data.clientId;

    // The approval screen, answered the way a person answers it.
    const authorize = await axios.get(
      `/oauth/authorize?response_type=code&client_id=${clientId}&scope=${encodeURIComponent(config.consentedScope)}`,
      { maxRedirects: 0, validateStatus: () => true },
    );
    const transactionId = new URL(
      String(authorize.headers.location ?? ""),
      config.homepage,
    ).searchParams.get("transaction_id");
    if (!transactionId) {
      throw new Error(
        `the approval screen did not offer anything to approve: ${JSON.stringify(authorize.headers.location ?? authorize.data)}`,
      );
    }
    const decided = await axios.post(
      "/oauth/decision",
      new URLSearchParams({ transaction_id: transactionId }).toString(),
      {
        maxRedirects: 0,
        validateStatus: () => true,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
    const code = new URL(
      String(decided.headers.location ?? ""),
      config.homepage,
    ).searchParams.get("code");
    if (!code) {
      throw new Error(
        `approving the app produced no code: ${JSON.stringify(decided.headers.location ?? decided.data)}`,
      );
    }

    const secret = await axios.post<{ secret: string }>(
      `${OAUTH_CLIENT}/${clientId}/secret`,
      {},
      { validateStatus: () => true },
    );
    if (!secret.data?.secret) {
      throw new Error(
        `the app was given no secret to authenticate with: ${JSON.stringify(secret.data)}`,
      );
    }

    const tokenResponse = await formPost("/oauth/access_token", {
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: secret.data.secret,
      redirect_uri: config.redirectUri,
    });
    const tokenBody = (await tokenResponse.json()) as {
      access_token?: string;
      token_type?: string;
    };
    if (!tokenBody.access_token) {
      throw new Error(
        `exchanging the approval for a token answered ${tokenResponse.status}: ${JSON.stringify(tokenBody)}`,
      );
    }
    const authorization = `${tokenBody.token_type ?? "Bearer"} ${tokenBody.access_token}`;

    const asTheApp = (path: string) =>
      fetch(`${apiUrl}${path}`, { headers: { Authorization: authorization } });

    // Fixture verification, outside the checkpoint: the token works for what it
    // was approved for. A token that works nowhere would be refused below for
    // reasons that have nothing to do with scope.
    const inScope = await asTheApp(config.inScopePath);
    if (!inScope.ok) {
      throw new Error(
        `the token does not work for what it was approved for (${inScope.status} on ${config.inScopePath}) - ` +
          "the fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "an-approved-app-can-do-only-what-it-was-approved-for",
      async () => {
        const beyond = await asTheApp(config.outOfScopePath);
        if (beyond.ok) {
          const body = await beyond.text();
          throw new Error(
            `an app approved only for ${JSON.stringify(config.consentedScope)} answered ${beyond.status} on ` +
              `${config.outOfScopePath}: ${body.slice(0, 160)} - it can list every base the approving person can ` +
              "reach, which no approval screen mentioned",
          );
        }
        if (beyond.status !== config.expectedStatus) {
          throw new Error(
            `the request was refused with ${beyond.status}, expected ${config.expectedStatus} - refused for some ` +
              "other reason is worth seeing rather than passing",
          );
        }
        return { status: beyond.status };
      },
    );

    return {
      details: {
        clientId,
        consentedScope: config.consentedScope,
        inScopeStatus: inScope.status,
        outOfScopeStatus: probe.status,
      },
    };
  } finally {
    if (clientId) {
      try {
        await axios.delete(`${OAUTH_CLIENT}/${clientId}`, {
          validateStatus: () => true,
        });
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (client ${clientId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
