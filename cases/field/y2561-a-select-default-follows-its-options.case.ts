import { defineBugCase } from "../../framework/types";

// T7820: Renaming the option a select default named left the default pointing
// at a name that no longer existed, so every later save of the column was
// refused; deleting the options a multi-select default named left an empty
// default.
export default defineBugCase({
  id: "field/y2561-a-select-default-follows-its-options",
  title:
    "A select default follows a renamed option and clears with a deleted one",
  runner: "select-default-follows-options",
  timeoutMs: 180_000,
  bug: {
    issue: "T7820",
    status: "fixed",
    sourceCommits: ["92594e794"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-select-default",
    singleChoices: ["Alpha", "Beta"],
    multiChoices: ["A", "B", "C"],
    renameSuffix: "renamed",
  },
});
