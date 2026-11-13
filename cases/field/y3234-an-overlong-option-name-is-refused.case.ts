import { defineBugCase } from "../../framework/types";

// T4291: Select option names over the length limit were stored, and broke the
// editor, filters and imports that render them later.
export default defineBugCase({
  id: "field/y3234-an-overlong-option-name-is-refused",
  title: "An option name over the length limit is refused with a clear error",
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
