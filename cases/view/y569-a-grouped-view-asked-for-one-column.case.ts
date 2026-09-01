import { defineBugCase } from "../../framework/types";

// T6495: a grouped table is mostly its headings - the value each group is for
// and how many rows are in it. Asking for a narrowed set of columns, the way
// the grid asks when the rest are scrolled out of sight, dropped them. The
// rows arrive; the grouping does not, so the table reads as a flat list. Which
// columns happen to be on screen is not something a person chooses or notices.
export default defineBugCase({
  id: "view/y569-a-grouped-view-asked-for-one-column",
  title: "A grouped view asked for one column keeps its group headings",
  runner: "projected-group-headers",
  timeoutMs: 180_000,
  bug: {
    issue: "T6495",
    status: "fixed",
    sourceCommits: ["dd983313c"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-projected-groups",
    rowStatuses: ["open", "open", "done", "blocked"],
  },
});
