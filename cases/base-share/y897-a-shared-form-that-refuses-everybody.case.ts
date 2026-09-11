import { defineBugCase } from "../../framework/types";

// T4612: whether a form accepts submissions was kept as a stored flag beside
// the fact that the view is a form - two places saying the same thing, and one
// of them writable by anybody who can reach the settings endpoint: another
// tool, a script, an assistant tidying up. Set to false, the form stops taking
// anything, and no screen shows the flag or turns it back on. The fix removes
// it: a form takes submissions because it is a form.
export default defineBugCase({
  id: "base-share/y897-a-shared-form-that-refuses-everybody",
  title: "A shared form keeps taking submissions",
  runner: "form-submit-flag-cannot-brick",
  timeoutMs: 180_000,
  bug: {
    issue: "T4612",
    status: "fixed",
    sourceCommits: ["fdc0c7e18"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-form-submit-flag",
    beforeValue: "filled in before",
    afterValue: "filled in after",
  },
});
