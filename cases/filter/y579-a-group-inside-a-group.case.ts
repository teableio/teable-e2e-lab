import { defineBugCase } from "../../framework/types";

// T4066: groups are how a filter says something a flat list cannot - this, and
// either of those. The word between the conditions inside a group belongs to
// that group; a person builds the nesting precisely because "and" at the top
// and "or" inside are different questions. An inner group was joined with the
// word from the level above it, so asking for "either of these" got "both of
// these", which nothing satisfies.
export default defineBugCase({
  id: "filter/y579-a-group-inside-a-group",
  title: "Each group in a filter joins its own conditions",
  runner: "nested-filter-conjunction",
  timeoutMs: 180_000,
  bug: {
    issue: "T4066",
    status: "fixed",
    sourceCommits: ["1463232d6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-nested-filter",
    statuses: [1, 2, 3],
    firstWanted: 1,
    secondWanted: 2,
  },
});
