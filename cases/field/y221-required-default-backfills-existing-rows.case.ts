import { defineBugCase } from "../../framework/types";

// T5685, the same wrong order one step earlier: a required column with a
// default, added to a table that already holds rows, was refused because the
// existing rows were checked against the constraint before the default had
// been written into them.
export default defineBugCase({
  id: "field/y221-required-default-backfills-existing-rows",
  title: "A required column with a default can be added to a table with rows",
  runner: "required-default",
  timeoutMs: 180_000,
  bug: {
    issue: "T5685",
    status: "fixed",
    sourceCommits: ["cae1c5c10"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-required-backfill",
    moment: "onAddField",
    defaultValue: "unassigned",
  },
});
