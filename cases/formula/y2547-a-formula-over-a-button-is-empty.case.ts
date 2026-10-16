import { defineBugCase } from "../../framework/types";

// T7819: A formula referring to a button column read the button's click
// bookkeeping as the text {"count": 1}.
export default defineBugCase({
  id: "formula/y2547-a-formula-over-a-button-is-empty",
  title: "A formula referring to a button column reads empty",
  runner: "button-formula-reference",
  timeoutMs: 180_000,
  bug: {
    issue: "T7819",
    status: "fixed",
    sourceCommits: ["b6f2d8ef7"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-button-formula",
    counts: [1, 3],
  },
});
