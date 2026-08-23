import { defineBugCase } from "../../framework/types";

// T6615: a conditional lookup whose condition compares two columns of the
// table it reads from - "where these two columns of the source agree". The
// builder swaps the two sides of a same-table reference, so the predicate
// probed the referenced column on the source alias and answered "column
// s.<name> does not exist". The whole computed run dead-lettered as a code
// bug - not retried, on every recompute.
export default defineBugCase({
  id: "lookup/conditional-filter-compares-two-own-columns",
  title:
    "A conditional lookup conditioned on two columns of its source computes",
  runner: "conditional-filter-field-refs",
  timeoutMs: 300_000,
  bug: {
    issue: "T6615",
    status: "fixed",
    sourceCommits: ["bfe5599ed"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-cond-source-ref",
    source: "sourceBothSides",
    foreignRows: [
      { name: "keys-agree", left: "K1", right: "K1", value: "from-the-match" },
      { name: "keys-differ", left: "K1", right: "K2", value: "not-this-one" },
    ],
    hostRows: [
      { name: "host-1", left: "H1", right: "H1" },
      { name: "host-2", left: "H1", right: "H2" },
    ],
    editedValue: "changed-at-the-source",
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
