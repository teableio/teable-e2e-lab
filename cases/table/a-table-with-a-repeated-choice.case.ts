import { defineBugCase } from "../../framework/types";

// T3401: two choices with one name is not something anyone sets up on purpose
// - it is what an import that ran twice, a merged option list or a migration
// leaves behind, and nothing in the product shows it. Reading the table then
// failed outright: not the column, the table, every row for everyone, because
// the column's settings are read before any row can be handed out. A base
// where one table cannot be opened at all, for a reason invisible in the
// interface, gets reported as "teable is down".
export default defineBugCase({
  id: "table/a-table-with-a-repeated-choice",
  title: "A table whose column lists the same choice twice still opens",
  runner: "duplicate-select-choice",
  timeoutMs: 180_000,
  bug: {
    issue: "T3401",
    status: "fixed",
    sourceCommits: ["98906d222"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-duplicate-choice",
    repeatedChoice: "In progress",
    otherChoice: "Done",
    rowTitles: ["first-row", "second-row"],
  },
});
