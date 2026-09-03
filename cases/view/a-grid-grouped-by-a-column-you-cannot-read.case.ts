import { defineBugCase } from "../../framework/types";

// T6944: under the authority matrix a role can withhold a single column, and the
// rest of the table stays readable - that is the point of withholding one column
// rather than the table. But a view remembers what it is grouped by and the page
// sends that grouping with every request for rows, so asked to group by a column
// the reader may not see, the server refused the request outright. What the
// person got was not a view without its grouping but a view with no rows at all
// and a message about a data validation error, naming neither the column nor the
// grouping. An administrator opening the same view sees everything.
export default defineBugCase({
  id: "view/a-grid-grouped-by-a-column-you-cannot-read",
  title: "A grid grouped by a column you cannot read still shows its rows",
  runner: "group-on-an-unreadable-column",
  timeoutMs: 300_000,
  bug: {
    issue: "T6944",
    status: "fixed",
    sourceCommits: ["2ae77481c"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-group-unreadable",
    rows: [
      { name: "first-deal", stage: "open", cost: 10 },
      { name: "second-deal", stage: "won", cost: 20 },
      { name: "third-deal", stage: "open", cost: 30 },
    ],
  },
});
