import { defineBugCase } from "../../framework/types";

// T6728: a computed cell has a size ceiling, and a formula over a long text
// value can cross it on one row while every other row in the table stays far
// below it. The computed task failed as a unit and dead-lettered as a
// data-safety failure, so the rows around the offending one never got their
// values either - the write answered 200 and their cells simply stayed empty.
export default defineBugCase({
  id: "computed/oversized-cell-does-not-stall-its-neighbours",
  title: "One oversized formula result does not stop the other rows computing",
  runner: "computed-oversized-cell",
  timeoutMs: 300_000,
  bug: {
    issue: "T6728",
    status: "fixed",
    sourceCommits: ["175d1de3f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-oversized-computed",
    // 100k characters repeated three times is 300k bytes, over the 262144-byte
    // computed ceiling, while the source cell itself stays well under it.
    oversizedChars: 100_000,
    repeatTimes: 3,
    ordinaryRowCount: 4,
    seedValue: "seed",
    ordinaryValue: "ordinary",
    settleTimeoutMs: 90_000,
    settlePollIntervalMs: 1_000,
  },
});
