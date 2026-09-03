import { defineBugCase } from "../../framework/types";

// T6243: a single-select field is its choices - the list somebody picked, in
// the colors they picked. A lookup of one carries that list along, and a
// lookup of that lookup carries it again, which is how a status set on one
// table shows up with its colors two links away. Renaming the last column
// dropped the list: the cells keep their values, so nothing looks broken until
// someone opens the filter dropdown and finds it empty.
export default defineBugCase({
  id: "lookup/y217-renaming-a-nested-lookup-keeps-its-choices",
  title: "Renaming a nested status column keeps the choices it carries",
  runner: "nested-lookup-rename",
  timeoutMs: 180_000,
  bug: {
    issue: "T6243",
    status: "fixed",
    sourceCommits: ["1d9d7d429"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-nested-rename",
    choiceNames: ["Queued", "Active", "Done"],
    renamedTo: "Renamed Nested Status",
  },
});
