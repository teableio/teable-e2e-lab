import { defineBugCase } from "../../framework/types";

// T3275: pasting over a selection is not always an edit. People re-paste the
// same export to be sure it went in, paste a column back over itself after
// sorting, or paste a block that overlaps rows they already filled in. Rows
// that end up holding what they already held were stamped as changed anyway,
// and "last changed" is what a team uses to see what moved since yesterday.
export default defineBugCase({
  id: "selection/paste-what-a-row-already-holds",
  title: "Pasting what a row already holds does not mark it changed",
  runner: "paste-noop-stamp",
  timeoutMs: 180_000,
  bug: {
    issue: "T3275",
    status: "fixed",
    sourceCommits: ["bf3d1c8f0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-noop",
    controlNote: "control-note",
    editedNote: "control-note-edited",
    keptNote: "kept-note",
    stepMs: 1100,
  },
});
