import { defineBugCase } from "../../framework/types";

// T7936: Importing an Excel worksheet that has no columns was refused without a
// translation key.
export default defineBugCase({
  id: "import/y3353-an-empty-worksheet-in-your-language",
  title:
    "Importing a worksheet with no columns is refused with its translation key",
  runner: "localized-error-key",
  timeoutMs: 120_000,
  bug: {
    issue: "T7936",
    status: "fixed",
    sourceCommits: ["fd7ab2fc8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-excel-empty-sheet",
    scenario: "excel-empty-sheet",
    locale: "ja",
    expectedStatus: 400,
    expectedKey: "httpErrors.import.excelSheetNoColumns",
  },
});
