import { defineBugCase } from "../../framework/types";

// T7621: a form that already hid a column showed every column added to the
// table afterwards, so the public saw internal questions the moment they were
// created. A form that hides nothing should still show them.
export default defineBugCase({
  id: "view/a-new-column-stays-off-a-trimmed-form",
  title: "A new column stays off a form that already hides one",
  runner: "new-field-in-customized-view",
  timeoutMs: 120_000,
  bug: {
    issue: "T7621",
    status: "fixed",
    sourceCommits: ["1deecc1b6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-trimmed-form",
    newFieldName: "Added later",
  },
});
