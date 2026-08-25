import { defineBugCase } from "../../framework/types";

// T6208: a choice column is its choices - they are what the cell draws, what a
// filter lists, and what a person picks from. Repointing which link a borrowed
// choice column travels along is an ordinary edit after the tables are
// rearranged, and it wiped them. The column keeps its name and its place, the
// cells keep their text, and everything built on the choices stops working.
export default defineBugCase({
  id: "lookup/repoint-a-borrowed-choice-column",
  title: "Repointing a borrowed choice column keeps its choices",
  runner: "lookup-select-choices-kept",
  timeoutMs: 180_000,
  bug: {
    issue: "T6208",
    status: "fixed",
    sourceCommits: ["76cba0289"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-borrowed-choices",
    choices: ["open", "done"],
  },
});
