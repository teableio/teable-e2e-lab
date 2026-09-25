import { defineBugCase } from "../../framework/types";

// T7305: "contains" on a column that stores a list - a link here - wrote the
// typed value into the query as text, so an apostrophe ended it early and
// the request failed with a SQL syntax error. Filtering a contact list for
// O'Brien took the view down. Released before this case was written.
export default defineBugCase({
  id: "filter/filter-a-link-for-a-name-with-an-apostrophe",
  title: "A link column can be filtered for a name with an apostrophe",
  runner: "contains-filter-quote",
  timeoutMs: 120_000,
  bug: {
    issue: "T7305",
    status: "fixed",
    sourceCommits: ["2124a06aa"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-apostrophe-filter",
    titles: ["O'Brien", "Plain contact", "It's done"],
    control: "Plain",
    probes: ["O'Brien", "'"],
  },
});
