import { defineBugCase } from "../../framework/types";

// T8420: Paste treated text that looks like a record id as a reference in text
// columns too, so values starting with "rec" were dropped or rewritten.
export default defineBugCase({
  id: "record/y3877-pasted-rec-prefixed-text-stays-text",
  title: 'Pasted text that starts with "rec" stays as typed',
  runner: "paste-rec-prefixed-text",
  timeoutMs: 180_000,
  bug: {
    issue: "T8420",
    status: "fixed",
    sourceCommits: ["a233aae87"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-rec-text",
    values: [
      "rec_sample_01",
      "rec-test-02",
      "recipe_test",
      "record123",
      "recABCDEFGHIJKLMNOP",
      "rec sample 09",
    ],
  },
});
