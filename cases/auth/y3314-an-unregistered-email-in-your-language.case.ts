import { defineBugCase } from "../../framework/types";

// sentinel/reset-email-unregistered-key: The forgot-password form shows the
// server's refusal in the person's language through its translation key. The
// key was already sent before #4020, which changed the page; this guards the
// server half the page depends on.
export default defineBugCase({
  id: "auth/y3314-an-unregistered-email-in-your-language",
  title:
    "Resetting the password of an unregistered email is refused with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "sentinel/reset-email-unregistered-key",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-reset-unregistered",
    scenario: "reset-email-unregistered",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.auth.emailNotRegistered",
  },
});
