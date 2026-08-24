import { defineBugCase } from "../../framework/types";

// T4865: widening a member column from one person to several is a normal
// mid-flight change - a task that had one owner now has two. The column starts
// holding a list, and anything reading it has to change shape with it. A
// formula reading it did not: the column says two owners and the column
// derived from it still says one, and whatever consumes the second - an
// export, a filter, a message built from it - keeps working with the wrong
// shape and never says so.
export default defineBugCase({
  id: "formula/formula-follows-a-user-column-widening",
  title: "A formula follows a member column that becomes multiple",
  runner: "user-multiplicity-formula",
  timeoutMs: 180_000,
  bug: {
    issue: "T4865",
    status: "fixed",
    sourceCommits: ["d54385984"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-user-widening",
    settleTimeoutMs: 30_000,
    pollIntervalMs: 1_000,
  },
});
