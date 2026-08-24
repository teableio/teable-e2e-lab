import { defineBugCase } from "../../framework/types";

// T6606: before the product rewrites a column it says what the rewrite will
// cost and asks. Editing the instruction behind an AI column costs nothing -
// nothing is recomputed until the person asks for it - and the editor asked
// anyway, because the settings it resubmits unchanged were read as a different
// set than the ones stored. A warning that appears for a change that rewrites
// nothing is a warning people learn to click through.
export default defineBugCase({
  id: "field/change-only-the-instruction-behind-a-column",
  title: "Changing only the instruction behind a column plans no rewrite",
  runner: "ai-config-only-change-plan",
  timeoutMs: 180_000,
  bug: {
    issue: "T6606",
    status: "fixed",
    sourceCommits: ["75e9ef0d8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-ai-config-plan",
    modelKey: "the-old-model",
    newModelKey: "the-new-model",
    prompt: "Write a short reply.",
  },
});
