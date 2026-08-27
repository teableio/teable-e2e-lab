import { defineBugCase } from "../../framework/types";

// The Excel reader took the header row to be row index 0 of the sheet's dense
// row array. A used range that starts at A2 leaves index 0 empty, so the
// headers were read out of a hole and the file came back with no columns at
// all - a spreadsheet that opens perfectly well in Excel, reported as empty.
//
// A title line, a spacer row, or a frozen banner above the table is enough to
// push the used range below A1, which is why this is ordinary rather than
// exotic.
export default defineBugCase({
  id: "import/excel-header-below-a1",
  title: "An Excel sheet starting below A1 imports its header row",
  runner: "excel-import-offset-header",
  timeoutMs: 180_000,
  skipV1:
    "the case has the product create a second base mid-run, which is stamped v2 and cannot be unstamped before its tables are built - this method cannot ask v1, which is not the same as v1 lacking the feature",
  bug: {
    issue: "T6867",
    status: "fixed",
    sourceCommits: ["22b1516cd"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-offset-header",
    // A2, so row 1 is empty and the used range starts one row down - the
    // smallest offset that reproduces, and the one a spacer row produces.
    origin: "A2",
    headers: ["Name", "Amount", "City"],
    row: ["Ada", 42, "Shanghai"],
    timeZone: "Asia/Shanghai",
  },
});
