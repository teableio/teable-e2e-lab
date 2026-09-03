import { defineBugCase } from "../../framework/types";

// T5412: a sheet does not always carry a header. An export from another
// system, a paste into a text file, a log somebody saved - the first line is a
// record like any other, and the import dialog has a switch that says so. With
// that switch off the first line was dropped anyway: the import reports
// success, the table looks full, and the row that is gone is the one at the
// top.
export default defineBugCase({
  id: "import/y226-headerless-sheet-imports-every-line",
  title: "A sheet with no header row imports its first line too",
  runner: "csv-headers-disabled",
  timeoutMs: 180_000,
  bug: {
    issue: "T5412",
    status: "fixed",
    sourceCommits: ["04c6475f0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-csv-no-header",
    mode: "newTable",
    rows: [
      { ref: "REF-001", note: "the first line" },
      { ref: "REF-002", note: "the second line" },
      { ref: "REF-003", note: "the third line" },
    ],
  },
});
