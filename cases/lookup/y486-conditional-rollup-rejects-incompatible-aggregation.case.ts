import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y486-conditional-rollup-rejects-incompatible-aggregation",
  title: "A conditional rollup rejects incompatible source and function pairs",
  runner: "rollup-create-validation",
  timeoutMs: 180_000,
  bug: {
    issue: "T7087",
    status: "fixed",
    sourceCommits: ["a7c1edd14"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y486-rollup-validation",
    mode: "conditionalRollup",
  },
});
