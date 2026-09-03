import { defineBugCase } from "../../framework/types";

// T6980: "cost depends on where the cost comes from" - a manually entered figure
// for some rows, a different figure for others, and otherwise whatever is
// linked. The first two answers are numbers; the last is a list of linked
// records, stored as a document rather than as a number. The step merging the
// branches compared only the ones with a case attached, and those agreed, so it
// never looked at what the otherwise branch held. The database was then asked to
// choose between numbers and a document in one expression and refused, killing
// the column and the schema change it was part of.
export default defineBugCase({
  id: "formula/a-column-that-picks-by-case",
  title: "A column that picks by case, ending in linked records, can be made",
  runner: "switch-mixed-branch-storage",
  timeoutMs: 300_000,
  bug: {
    issue: "T6980",
    status: "fixed",
    sourceCommits: ["fd0be31ad"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-switch-mixed",
    numberBranches: [
      { choice: "Manual", column: "Manual cost", value: 11 },
      { choice: "Current", column: "Current cost", value: 22 },
    ],
    otherwiseChoice: "Unmapped",
    linkedRows: [
      { name: "price-one", price: 100 },
      { name: "price-two", price: 200 },
    ],
  },
});
