import { defineBugCase } from "../../framework/types";

// sentinel/reset-token-invalid-key: The reset-password form shows the server's
// refusal in the person's language through its translation key. The key was
// already sent before #4020, which changed the page; this guards the server
// half the page depends on.
export default defineBugCase({
  id: "auth/y3315-an-invalid-reset-token-in-your-language",
  title:
    "Resetting a password with an invalid token is refused with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "sentinel/reset-token-invalid-key",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-reset-token",
    scenario: "reset-token-invalid",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.auth.tokenInvalid",
    password: "Review400Password!",
  },
});
