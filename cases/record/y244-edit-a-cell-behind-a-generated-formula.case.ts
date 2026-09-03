import { defineBugCase } from "../../framework/types";

// T5481: on a table carried over from an older version the formula column is
// one the database works out itself. The product recalculates formula columns
// by writing into them, that write is refused, and the edit that triggered it
// is refused with it - so the row cannot be changed at all. What fails is the
// ordinary column someone is trying to correct, and the message is about a
// column they never touched.
export default defineBugCase({
  id: "record/y244-edit-a-cell-behind-a-generated-formula",
  title: "An ordinary cell can be edited beside a database-generated formula",
  runner: "generated-formula-column",
  timeoutMs: 180_000,
  bug: {
    issue: "T5481",
    status: "fixed",
    sourceCommits: ["d42d13443"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-generated-formula",
    rowTitle: "the-row",
    quantityBefore: 3,
    quantityAfter: 7,
  },
});
