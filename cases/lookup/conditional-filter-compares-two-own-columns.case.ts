import { defineBugCase } from "../../framework/types";

// T6615: a conditional lookup whose condition compares two columns of the
// table it lives on, reading a value out of that same table. The predicate
// probes the referenced field on the source alias, so it answered "column
// s.<name> does not exist" and the whole computed run dead-lettered as a code
// bug - not retried, on every recompute.
export default defineBugCase({
  id: "lookup/conditional-filter-compares-two-own-columns",
  title: "A conditional lookup comparing two of its own columns computes",
  runner: "conditional-filter-field-refs",
  timeoutMs: 300_000,
  bug: {
    issue: "T6615",
    status: "fixed",
    sourceCommits: ["bfe5599ed"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-cond-self-ref",
    source: "selfTable",
    rows: [
      { name: "keys-agree", left: "K1", right: "K1", value: "matched" },
      { name: "keys-differ", left: "K1", right: "K2", value: "unmatched" },
    ],
    foreignValue: "unused",
    editedValue: "matched-again",
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
