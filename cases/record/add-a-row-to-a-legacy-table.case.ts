import { defineBugCase } from "../../framework/types";

// T6146: on a table carried over from an older version, "created by" is a
// column the database fills in itself. The product wrote the author into it on
// every insert, and Postgres refused the write - and the whole insert with it.
// What the user has is a table nothing can be added to, from the grid, the API
// or an import alike, with a message that says nothing about who created the
// row.
export default defineBugCase({
  id: "record/add-a-row-to-a-legacy-table",
  title: "A row can be added to a table carried over from the old version",
  runner: "legacy-generated-audit-column",
  timeoutMs: 180_000,
  bug: {
    issue: "T6146",
    status: "fixed",
    sourceCommits: ["317d3a8c2"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-legacy-createdby",
    rowTitle: "the-new-row",
  },
});
