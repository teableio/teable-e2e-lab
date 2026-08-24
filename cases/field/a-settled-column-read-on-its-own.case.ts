import { defineBugCase } from "../../framework/types";

// T6581: a worked-out column is marked while its values are being filled in,
// and the interface draws that mark as a column that is still busy. Asked for
// one column on its own, the product kept saying "still busy" for every
// worked-out column, forever; asked for the whole list, it said they were
// done. The same column is busy in one place on screen and finished in
// another, and nothing the person does moves it.
export default defineBugCase({
  id: "field/a-settled-column-read-on-its-own",
  title: "A settled column read on its own is not still busy",
  runner: "single-field-pending-state",
  timeoutMs: 240_000,
  bug: {
    issue: "T6581",
    status: "fixed",
    sourceCommits: ["d43dca178"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-pending-state",
    rowTitle: "the-row",
    memberName: "the-member",
    memberHandle: "the-handle",
    settleAttempts: 100,
    settleIntervalMs: 200,
  },
});
