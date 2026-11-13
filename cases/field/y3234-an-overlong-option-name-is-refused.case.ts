import { defineBugCase } from "../../framework/types";

// T4291: Pasting a value that creates a select option over the name length
// limit stored the option, and it broke the editor, filters and imports that
// render it later.
export default defineBugCase({
  id: "field/y3234-an-overlong-option-name-is-refused",
  title: "Pasting an option name over the length limit is refused clearly",
  runner: "select-choice-name-limit",
  timeoutMs: 180_000,
  bug: {
    issue: "T4291",
    status: "fixed",
    sourceCommits: ["0cb596b3a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-choice-name-limit",
    maxLength: 1000,
  },
});
