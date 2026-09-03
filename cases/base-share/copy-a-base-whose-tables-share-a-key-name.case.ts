import { defineBugCase } from "../../framework/types";

// T6990: Postgres constraint names are unique per table, not per schema, and
// old bases carry a self-referencing key called fk___id on every table.
// Duplicating a base drops those keys, copies the rows and puts them back - but
// the step that listed them matched on the name and the schema and not on the
// table, so each table's list came back holding the other's rows. The drop ran
// twice for one table, the second found nothing, and the whole copy died on a
// Postgres error naming a constraint that "does not exist". Reported from
// production as an unhandled rejection in the browser, with the base half-made.
export default defineBugCase({
  id: "base-share/copy-a-base-whose-tables-share-a-key-name",
  title: "A base whose tables share a key name can still be copied",
  runner: "same-named-fk-base-duplicate",
  timeoutMs: 300_000,
  bug: {
    issue: "T6990",
    status: "fixed",
    sourceCommits: ["b913e5014"],
  },
  config: {
    baseNamePrefix: "e2e-lab-same-named-fk",
    tableNames: ["the-first-table", "the-second-table"],
    rowTitle: "a-row-to-copy",
  },
});
