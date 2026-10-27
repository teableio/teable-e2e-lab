import { defineBugCase } from "../../framework/types";

// T7936: Renaming a table to blanks from the sidebar was refused by the generic
// input check, with no translation key, so the toast was English.
export default defineBugCase({
  id: "table/y3351-a-blank-table-name-in-your-language",
  title: "Renaming a table to blanks is refused with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "T7936",
    status: "fixed",
    sourceCommits: ["fd7ab2fc8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-table-name-blank",
    scenario: "table-name-blank",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.table.nameRequired",
    blankName: "   ",
  },
});
