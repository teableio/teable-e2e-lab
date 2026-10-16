import { defineBugCase } from "../../framework/types";

// T7827: A collaborator allowed to edit rows but not columns could add an
// option to a select by writing a new value with typecast.
export default defineBugCase({
  id: "record/y2729-an-editor-cannot-add-an-option-through-typecast",
  title: "An editor cannot add a select option by writing with typecast",
  runner: "editor-select-autocreate",
  timeoutMs: 180_000,
  bug: {
    issue: "T7827",
    status: "fixed",
    sourceCommits: ["5255dd724"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-editor-typecast",
    scenario: "typecast",
    choices: ["A", "B"],
    newValue: "X",
  },
});
