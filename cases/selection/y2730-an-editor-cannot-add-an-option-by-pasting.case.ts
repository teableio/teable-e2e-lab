import { defineBugCase } from "../../framework/types";

// T7822: A collaborator allowed to edit rows but not columns could add an
// option to a select by pasting a new value into it.
export default defineBugCase({
  id: "selection/y2730-an-editor-cannot-add-an-option-by-pasting",
  title: "An editor cannot add a select option by pasting",
  runner: "editor-select-autocreate",
  timeoutMs: 180_000,
  bug: {
    issue: "T7822",
    status: "fixed",
    sourceCommits: ["5255dd724"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-editor-paste",
    scenario: "paste",
    choices: ["A", "B"],
    newValue: "X",
  },
});
