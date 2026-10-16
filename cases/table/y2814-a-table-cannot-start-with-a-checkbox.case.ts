import { defineBugCase } from "../../framework/types";

// T7771: creating a table whose primary column is a checkbox, attachment,
// button or link was refused without the public VALIDATION_ERROR code, so
// clients matching on that code did not recognise the refusal.
export default defineBugCase({
  id: "table/y2814-a-table-cannot-start-with-a-checkbox",
  title:
    "A table cannot be created with a column that cannot name rows as its primary",
  runner: "unsupported-primary-create",
  timeoutMs: 180_000,
  bug: {
    issue: "T7771",
    status: "fixed",
    sourceCommits: ["f17269a58"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-unsupported-primary",
    types: ["checkbox", "attachment", "button", "link"],
    expectedCode: "VALIDATION_ERROR",
  },
});
