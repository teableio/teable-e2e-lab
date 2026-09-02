import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y470-ordinary-rollup-rejects-incompatible-aggregation",
  title: "An ordinary rollup rejects incompatible source and function pairs",
  runner: "rollup-create-validation",
  timeoutMs: 180_000,
  bug: {
    issue: "T7046",
    status: "fixed",
    sourceCommits: ["4bb07b0b6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y470-rollup-validation",
    mode: "rollup",
  },
});
