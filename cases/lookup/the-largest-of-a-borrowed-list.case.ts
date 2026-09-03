import { defineBugCase } from "../../framework/types";

// T7099: a conditional total asking for the largest or the smallest over a
// column that is itself a borrowed list. Sum and average had been taught
// to look inside those lists; these four had not, and went straight at the
// stored list, which Postgres refuses outright. The column then never produced
// anything - empty, with no explanation, on a field the interface offered to
// build. Sum on the same source works, which makes it look like the data is
// wrong rather than the function.
export default defineBugCase({
  id: "lookup/the-largest-of-a-borrowed-list",
  title: "The largest of a borrowed list is a number, not a refusal",
  runner: "jsonb-lookup-aggregate",
  timeoutMs: 300_000,
  bug: {
    issue: "T7099",
    status: "fixed",
    sourceCommits: ["281f6ae1a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-jsonb-agg",
    matchKey: "the-only-group",
    middleRowName: "the-team",
    hostRowName: "the-report",
    leaves: [
      { name: "leaf-small", amount: 10 },
      { name: "leaf-large", amount: 30 },
    ],
    aggregations: ["max", "min"],
    settleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
