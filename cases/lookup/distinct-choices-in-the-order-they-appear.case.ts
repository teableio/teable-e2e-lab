import { defineBugCase } from "../../framework/types";

// T7044: two wrong answers from one summary. A parent row summarising its
// children's choice column got "Todo" then "Done" back as "Done, Todo" - sorted,
// not in the order of the rows - so it disagreed with the plain list beside it.
// And when both children said "Todo", the count of distinct values answered 2:
// it was counting rows. Neither looks broken; 2 is the number of children, and
// a reordered pair of words reads as an arbitrary choice.
export default defineBugCase({
  id: "lookup/distinct-choices-in-the-order-they-appear",
  title: "Distinct choices come back in the order the rows are in",
  runner: "select-rollup-unique-and-count",
  timeoutMs: 300_000,
  bug: {
    issue: "T7044",
    status: "fixed",
    sourceCommits: ["ebd9d7549"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-select-rollup-unique",
    parentRowName: "the-parent",
    children: [
      { name: "child-first", status: "Todo" },
      { name: "child-second", status: "Done" },
    ],
    whenTheRowIsWritten: "beforeTheSummaries",
    alsoCheckAfterAnEdit: true,
    retarget: { childName: "child-second", status: "Todo" },
    settleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
