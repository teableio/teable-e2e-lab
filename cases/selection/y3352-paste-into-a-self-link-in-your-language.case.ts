import { defineBugCase } from "../../framework/types";

// T7936: Pasting a title that matches no row into a link field pointing at its
// own table was refused without a translation key.
export default defineBugCase({
  id: "selection/y3352-paste-into-a-self-link-in-your-language",
  title:
    "Pasting a new title into a self link is refused with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "T7936",
    status: "fixed",
    sourceCommits: ["fd7ab2fc8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-self-link",
    scenario: "paste-self-link",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.selection.linkAutoCreateSelfLinkUnsupported",
    pastedTitle: "no-such-title",
  },
});
