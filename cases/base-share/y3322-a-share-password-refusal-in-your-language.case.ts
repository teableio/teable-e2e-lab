import { defineBugCase } from "../../framework/types";

// sentinel/share-auth-password-key: The share password page shows the server's
// refusal in the person's language through its translation key. The key was
// already sent before #4020, which changed the page; this guards the server
// half the page depends on.
export default defineBugCase({
  id: "base-share/y3322-a-share-password-refusal-in-your-language",
  title: "A share without a password refuses one with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "sentinel/share-auth-password-key",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-share-auth",
    scenario: "share-auth-without-password",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.shareAuth.passwordRestrictionNotEnabled",
    password: "any-password-400",
  },
});
