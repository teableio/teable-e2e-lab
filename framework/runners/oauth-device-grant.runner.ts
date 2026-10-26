import { axios, createAxios } from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { OAuthDeviceGrantCaseConfig } from "../types";

const AUTH_USER_PATH = "/auth/user";
const DEVICE_CODE_PATH = "/oauth/device/code";
const DEVICE_APP_PATH = "/oauth/device";
const DEVICE_DECISION_PATH = "/oauth/device/decision";
const TOKEN_PATH = "/oauth/access_token";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const FORM_HEADERS = {
  "Content-Type": "application/x-www-form-urlencoded",
};

type UserProfile = {
  id?: string;
  email?: string;
};

type DeviceCodeResponse = {
  device_code?: unknown;
  user_code?: unknown;
  verification_uri?: unknown;
  expires_in?: unknown;
  interval?: unknown;
};

type DeviceAppResponse = {
  name?: unknown;
  scopes?: unknown;
};

type TokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  refresh_expires_in?: unknown;
  scopes?: unknown;
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export const runOAuthDeviceGrantCase = async (
  bugCase: BugCaseFor<"oauth-device-grant">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: OAuthDeviceGrantCaseConfig = bugCase.config;
  const apiBaseUrl = `${context.appUrl}/api`;
  const anonymous = createAxios();
  anonymous.defaults.baseURL = apiBaseUrl;

  // Preconditions, outside the checkpoint: there is a signed-in approver, and
  // a separate client without that session genuinely starts anonymous.
  const approver = (await axios.get<UserProfile>(AUTH_USER_PATH)).data;
  if (
    approver.id !== globalThis.testConfig.userId ||
    approver.email !== globalThis.testConfig.email
  ) {
    throw new Error(
      `the approval session is not the seed user (id=${String(approver.id)}, email=${String(approver.email)})`,
    );
  }
  const anonymousProfile = await anonymous.get(AUTH_USER_PATH, {
    validateStatus: () => true,
  });
  if (anonymousProfile.status !== 401) {
    throw new Error(
      `the anonymous control answered ${anonymousProfile.status}, expected 401; the final bearer-token check could inherit a session`,
    );
  }

  let tokenIssued = false;
  try {
    const probe = await bugCheckpoint(
      "device-code-login-issues-a-working-bearer-token",
      async () => {
        const deviceResponse = await anonymous.post<DeviceCodeResponse>(
          DEVICE_CODE_PATH,
          new URLSearchParams({ client_id: config.clientId }).toString(),
          {
            headers: FORM_HEADERS,
            validateStatus: () => true,
          },
        );
        if (deviceResponse.status !== 200) {
          throw new Error(
            `device-code issuance answered ${deviceResponse.status}, expected 200`,
          );
        }

        const device = deviceResponse.data;
        if (!isNonEmptyString(device.device_code)) {
          throw new Error("device-code issuance returned no device code");
        }
        if (
          typeof device.user_code !== "string" ||
          !/^[A-Z]{4}-[A-Z]{4}$/.test(device.user_code)
        ) {
          throw new Error(
            "device-code issuance did not return an eight-letter grouped user code",
          );
        }
        if (!isPositiveNumber(device.expires_in)) {
          throw new Error("device-code issuance returned no positive expiry");
        }
        if (!isPositiveNumber(device.interval)) {
          throw new Error(
            "device-code issuance returned no positive polling interval",
          );
        }
        if (!isNonEmptyString(device.verification_uri)) {
          throw new Error("device-code issuance returned no verification URL");
        }
        const verificationUrl = new URL(device.verification_uri);
        if (verificationUrl.pathname !== config.verificationPath) {
          throw new Error(
            `the verification URL uses path ${verificationUrl.pathname}, expected ${config.verificationPath}`,
          );
        }

        const typedUserCode = device.user_code
          .toLowerCase()
          .replace(/[^a-z]/g, "");
        const appResponse = await axios.get<DeviceAppResponse>(
          `${DEVICE_APP_PATH}/${typedUserCode}`,
        );
        const app = appResponse.data;
        if (app.name !== config.expectedAppName) {
          throw new Error(
            `the approval lookup named ${String(app.name)}, expected ${config.expectedAppName}`,
          );
        }
        if (!Array.isArray(app.scopes) || app.scopes.length === 0) {
          throw new Error("the approval lookup returned no requested scopes");
        }

        const decision = await axios.post(
          DEVICE_DECISION_PATH,
          { userCode: device.user_code, approve: true },
          { validateStatus: () => true },
        );
        if (decision.status < 200 || decision.status >= 300) {
          throw new Error(
            `device-code approval answered ${decision.status}, expected a successful status`,
          );
        }

        const tokenResponse = await anonymous.post<TokenResponse>(
          TOKEN_PATH,
          new URLSearchParams({
            grant_type: DEVICE_GRANT_TYPE,
            device_code: device.device_code,
            client_id: config.clientId,
          }).toString(),
          {
            headers: FORM_HEADERS,
            validateStatus: () => true,
          },
        );
        if (tokenResponse.status !== 200) {
          throw new Error(
            `the approved device-code exchange answered ${tokenResponse.status}, expected 200`,
          );
        }

        const tokens = tokenResponse.data;
        if (
          tokens.token_type !== "Bearer" ||
          !isNonEmptyString(tokens.access_token) ||
          !isNonEmptyString(tokens.refresh_token) ||
          !isPositiveNumber(tokens.expires_in) ||
          !isPositiveNumber(tokens.refresh_expires_in) ||
          !Array.isArray(tokens.scopes) ||
          tokens.scopes.length === 0
        ) {
          throw new Error(
            "the approved exchange did not return a complete bearer token pair with lifetimes and scopes",
          );
        }
        tokenIssued = true;

        const bearerProfile = await anonymous.get<UserProfile>(AUTH_USER_PATH, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          validateStatus: () => true,
        });
        if (bearerProfile.status !== 200) {
          throw new Error(
            `the issued bearer token answered ${bearerProfile.status} on the authenticated profile endpoint, expected 200`,
          );
        }
        if (
          bearerProfile.data.id !== approver.id ||
          bearerProfile.data.email !== approver.email
        ) {
          throw new Error(
            `the bearer token resolved to id=${String(bearerProfile.data.id)}, email=${String(bearerProfile.data.email)} instead of the approving user`,
          );
        }

        return {
          appName: app.name,
          scopeCount: app.scopes.length,
          userCodeFormat: "AAAA-AAAA",
          expirySeconds: device.expires_in,
          pollingIntervalSeconds: device.interval,
          authenticatedUserId: bearerProfile.data.id,
        };
      },
    );

    return {
      details: {
        clientId: config.clientId,
        verificationPath: config.verificationPath,
        ...probe,
      },
    };
  } finally {
    if (tokenIssued) {
      try {
        await axios.post(`/oauth/client/${config.clientId}/revoke-token`);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
