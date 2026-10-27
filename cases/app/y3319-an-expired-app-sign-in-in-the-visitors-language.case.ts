import { defineBugCase } from "../../framework/types";

// T7936: An app sign-in callback with an expired or unknown state answered in
// English, on an app page that cannot translate it itself.
export default defineBugCase({
  id: "app/y3319-an-expired-app-sign-in-in-the-visitors-language",
  title: "An expired app sign-in is refused in the visitor's language",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "T7936",
    status: "fixed",
    sourceCommits: ["fd7ab2fc8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-app-callback",
    scenario: "app-callback-state-invalid",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.app.auth.signInStateInvalid",
    messagesByLocale: {
      ja: "ログインセッションが無効か、有効期限が切れています。もう一度ログインしてください。",
      de: "Die Anmeldesitzung ist ungültig oder abgelaufen. Bitte melden Sie sich erneut an.",
      "": "The sign-in session is invalid or has expired. Please sign in again.",
    },
  },
});
