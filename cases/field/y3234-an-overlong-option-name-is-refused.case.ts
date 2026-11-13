import { defineBugCase } from "../../framework/types";

// T4291: Converting a text column whose values exceed the option-name length
// limit to a select stored the overlong options (or failed halfway), and they
// broke the editor, filters and imports that render them later.
export default defineBugCase({
  id: "field/y3234-an-overlong-option-name-is-refused",
  title: "Converting text to a select refuses an overlong option name clearly",
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
