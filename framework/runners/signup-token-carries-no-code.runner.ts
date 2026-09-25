import { axios } from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SignupTokenCarriesNoCodeCaseConfig } from "../types";

// Ask for a signup verification code for a new address -> read the token the
// response hands back -> checkpoint: the token does not carry the code.
//
// Signing up with an email address mails a short code to that address, and
// the person proves they own it by typing the code back. The response to the
// request also returned a token to send back with the code - and that token
// was a signed JWT with the code inside it. Signed is not encrypted: anyone
// could read the code out of the token without ever seeing the mail, so
// "verified" addresses were not verified at all. Accounts were registered
// under addresses nobody could receive mail at.
//
// The token is read the way anyone holding it could read it: split on the
// dots and base64-decode the middle part. No key is involved - that is the
// point.
//
// Signing up is not an operation that moved to v2; there is no v2 answer to
// prove. The routing headers are recorded for the report and not asserted.

const SEND_SIGNUP_CODE = "/auth/send-signup-verification-code";

const decodePayload = (token: string): Record<string, unknown> | undefined => {
  const middle = token.split(".")[1];
  if (!middle) {
    return undefined;
  }
  try {
    return JSON.parse(
      Buffer.from(middle, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    return undefined;
  }
};

export const runSignupTokenCarriesNoCodeCase = async (
  bugCase: BugCaseFor<"signup-token-carries-no-code">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SignupTokenCarriesNoCodeCaseConfig = bugCase.config;
  // A fresh address per run: the code is rate-limited per address, and an
  // address that already has an account is refused before any code is made.
  const email =
    `${config.emailPrefix}-${context.runId}@example.com`.toLowerCase();

  const response = await axios.post<{ token?: string; expiresTime?: string }>(
    SEND_SIGNUP_CODE,
    { email },
    { validateStatus: () => true },
  );
  const routing = pickRoutingHeaders(response.headers);

  // Fixture verification, outside the checkpoint: the request was accepted
  // and handed back a token that decodes and names the address. Without that,
  // there is nothing to read the code out of.
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !response.data?.token
  ) {
    throw new Error(
      `asking for a signup code answered ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }
  const token = response.data.token;
  const payload = decodePayload(token);
  if (!payload || payload.email !== email) {
    throw new Error(
      `the token does not decode to a payload naming ${email}: ${JSON.stringify(payload ?? null)}`,
    );
  }

  const probe = await bugCheckpoint(
    "a-signup-token-does-not-carry-its-code",
    async () => {
      // Anything in the payload that looks like a short numeric code is the
      // leak, whatever it is called.
      const exposed = Object.entries(payload).filter(
        ([key, value]) =>
          key === "code" ||
          (typeof value === "string" && /^\d{4,8}$/.test(value)),
      );
      if (exposed.length > 0) {
        throw new Error(
          `the signup token hands the verification code to whoever holds it: its payload, readable ` +
            `without any key, carries ${JSON.stringify(Object.fromEntries(exposed))} - the address can ` +
            'be "verified" without ever receiving the mail',
        );
      }
      return { payloadKeys: Object.keys(payload).sort() };
    },
  );

  return {
    details: {
      routing,
      status: response.status,
      payloadKeys: probe.payloadKeys,
    },
  };
};
