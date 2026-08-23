import { defineBugCase } from "../../framework/types";

// T5453: a row has a formula over one of its own cells. Changing that cell
// answered with the formula's value from before the edit. The caller - the
// grid repainting the row, an automation carrying the number into its next
// step, an integration writing the row into its own store - takes that stale
// number away as the result of their own write, and it is plausible enough
// that nothing looks wrong.
export default defineBugCase({
  id: "record/inline-computed-in-update-response",
  title:
    "Editing a cell answers with the formula recomputed, not the old value",
  runner: "inline-computed-update-response",
  timeoutMs: 180_000,
  bug: {
    issue: "T5453",
    status: "fixed",
    sourceCommits: ["3ff04d015"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-inline-computed",
    price: 480,
    // 480 * 0.15 = 72 before the edit, 0 after it.
    newOrderRate: 0.15,
    renewalRate: 0.1,
  },
});
