import { defineBugCase } from "../../framework/types";

// T7082: two records are the same record when they have the same id, not when
// they happen to be called the same thing - and nothing stops two rows sharing a
// name. A summary of the distinct linked records compared what it displayed
// rather than what it had, so two different records both called "Same"
// collapsed into one and a real linked record left the answer. Nothing marks the
// column; the result is a plausible list of names; anything reading it
// afterwards is short by one.
export default defineBugCase({
  id: "lookup/two-records-with-one-name-are-two-records",
  title: "Two linked records sharing a name are still two records",
  runner: "link-rollup-unique-by-identity",
  timeoutMs: 300_000,
  bug: {
    issue: "T7082",
    status: "fixed",
    sourceCommits: ["9e77be25f", "5820e4fa3"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-unique-identity",
    parentRowName: "the-parent",
    childNamePrefix: "child",
    targetTitles: ["Same", "Same", "Other"],
    settleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
