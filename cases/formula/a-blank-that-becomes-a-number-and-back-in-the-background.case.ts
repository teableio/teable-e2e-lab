import { defineBugCase } from "../../framework/types";

// T7609: a text formula answering a rounded number or a blank, a second
// formula parsing it back, and a third on that. Worked out together, the
// first one's intermediate value was a number compared with "" as text, the
// database refused, and the formulas further down kept stale values.
export default defineBugCase({
  id: "formula/a-blank-that-becomes-a-number-and-back-in-the-background",
  title: "Formulas built on a blank-or-number formula follow it both ways",
  runner: "formula-cascade-blank-number",
  timeoutMs: 180_000,
  computedUpdateMode: "hybrid",
  bug: {
    issue: "T7609",
    status: "fixed",
    sourceCommits: ["e3fb02bad"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-blank-number-cascade",
    previous: 20,
    current: 8,
    sentinel: 99999,
    intervals: [5, 0],
    settleTimeoutMs: 30_000,
    pollIntervalMs: 500,
  },
});
