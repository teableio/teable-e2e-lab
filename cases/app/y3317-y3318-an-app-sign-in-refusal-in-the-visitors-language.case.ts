import { defineBugCase } from "../../framework/types";

// T7936: An app's own sign-in screen, which loads no Teable language files,
// showed "Login is not enabled for this app" in English whatever the visitor's
// language: the server sent neither a translated message nor a key.
export default defineBugCase({
  id: "app/y3317-y3318-an-app-sign-in-refusal-in-the-visitors-language",
  title:
    "An app with sign-in off refuses in the visitor's language, English by default",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "T7936",
    status: "fixed",
    sourceCommits: ["fd7ab2fc8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-app-login-off",
    scenario: "app-login-disabled",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.app.auth.loginDisabled",
    messagesByLocale: {
      ja: "このアプリではログインが有効になっていません",
      de: "Die Anmeldung ist für diese App nicht aktiviert",
      "": "Login is not enabled for this app",
    },
  },
});
