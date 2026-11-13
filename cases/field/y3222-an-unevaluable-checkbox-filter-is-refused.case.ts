import { defineBugCase } from "../../framework/types";

// T8318: A linked rollup filter of checkbox "is not" checked was accepted and
// saved, then failed in the background fill and ended as a dead letter while
// the column stayed empty.
export default defineBugCase({
  id: "field/y3222-an-unevaluable-checkbox-filter-is-refused",
  title: "A rollup filter a checkbox cannot evaluate is refused when saved",
  runner: "linked-filter-invalid-operator",
  timeoutMs: 180_000,
  bug: {
    issue: "T8318",
    status: "fixed",
    sourceCommits: ["a4b375c8d"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-linked-filter-operator",
    invalidOperator: "isNot",
  },
});
