import { defineBugCase } from "../../framework/types";

// T7936: Renaming a view to a name another view of the table already has was
// refused as "View names must be unique" with no translation key.
export default defineBugCase({
  id: "view/y3350-a-taken-view-name-in-your-language",
  title: "Renaming a view to a taken name is refused with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "T7936",
    status: "fixed",
    sourceCommits: ["fd7ab2fc8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-view-name-taken",
    scenario: "view-name-duplicate",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.view.nameAlreadyExists",
    secondViewName: "Second view",
  },
});
