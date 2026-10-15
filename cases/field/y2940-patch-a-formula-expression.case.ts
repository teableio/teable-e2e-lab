import { defineBugCase } from "../../framework/types";

// T7755: A PATCH sending only a formula's new expression answered 200 and
// changed nothing; the column went on computing the old expression.
export default defineBugCase({
  id: "field/y2940-patch-a-formula-expression",
  title: "Patching only a formula's expression changes what it computes",
  runner: "formula-patch-expression",
  timeoutMs: 180_000,
  bug: {
    issue: "T7755",
    status: "fixed",
    sourceCommits: ["e642bc4e9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-patch-formula",
    rowTitle: "row-1",
    amount: 10,
    prefix: "x",
    timeZone: "Asia/Shanghai",
  },
});
