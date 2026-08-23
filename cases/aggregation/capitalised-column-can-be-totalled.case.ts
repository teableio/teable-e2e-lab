import { defineBugCase } from "../../framework/types";

// T5586: Postgres folds an unquoted identifier to lower case, so a column
// stored as "TotalAmount" is only findable if the query quotes it. The
// aggregation query did not, and that number is the one a grid shows under the
// column - every summary row and group total is made of it. Column names
// follow field names, and a field named the way people name things - Total
// Amount, Due Date, Owner Email - has capitals, so this is not an exotic
// table.
export default defineBugCase({
  id: "aggregation/capitalised-column-can-be-totalled",
  title: "A column whose name has capitals can still be totalled",
  runner: "aggregation-mixed-case",
  timeoutMs: 180_000,
  bug: {
    issue: "T5586",
    status: "fixed",
    sourceCommits: ["ac2529116"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-agg-mixed-case",
    fieldName: "TotalAmount",
    column: "multiSelect",
    amounts: [100, 250, 25],
    tags: ["Urgent", "Backend"],
    rowTags: [["Urgent"], ["Urgent", "Backend"], []],
  },
});
