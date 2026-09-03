import { defineBugCase } from "../../framework/types";

// T6897: a "last changed" column can be narrowed to the columns a team
// actually cares about - when did this order's status last move, ignoring the
// notes somebody tidied up afterwards. The narrowing reached the value on
// screen and not the sort, so sorting by that column produced an order the
// column itself contradicts. Nobody suspects the sort; they suspect the
// timestamps, and there is nothing wrong with them.
export default defineBugCase({
  id: "view/y568-sort-by-a-narrowed-last-changed-column",
  title: "Sorting by a narrowed last-changed column follows what it shows",
  runner: "tracked-modified-sort",
  timeoutMs: 180_000,
  bug: {
    issue: "T6897",
    status: "fixed",
    sourceCommits: ["6e961b266"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-tracked-changed",
    rowNames: ["touched-first", "touched-second", "touched-last"],
    stepMs: 1100,
  },
});
