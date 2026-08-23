import { defineBugCase } from "../../framework/types";

// T6599: the same condition - two columns of the host table compared against
// each other - while the value comes from a different table. The set-based
// field-reference fast paths resolved the filter's field against the foreign
// table, did not find it there, and failed SQL generation with a bare "Field
// not found", dead-lettering the whole computed run as an obsolete plan on
// every recompute.
export default defineBugCase({
  id: "lookup/conditional-filter-over-a-foreign-table",
  title:
    "A conditional lookup on another table, conditioned on two own columns",
  runner: "conditional-filter-field-refs",
  timeoutMs: 300_000,
  bug: {
    issue: "T6599",
    status: "fixed",
    sourceCommits: ["3eff0a100"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-cond-foreign-ref",
    source: "foreignTable",
    rows: [
      { name: "keys-agree", left: "K1", right: "K1", value: "ignored" },
      { name: "keys-differ", left: "K1", right: "K2", value: "ignored" },
    ],
    foreignValue: "from-the-other-table",
    editedValue: "changed-over-there",
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
