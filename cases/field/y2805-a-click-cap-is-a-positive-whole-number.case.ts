import { defineBugCase } from "../../framework/types";

// T7769: A button's click cap of 0, -1 or 1.5 was accepted and stored.
export default defineBugCase({
  id: "field/y2805-a-click-cap-is-a-positive-whole-number",
  title: "A button's click cap must be a positive whole number",
  runner: "button-click-cap",
  timeoutMs: 180_000,
  bug: {
    issue: "T7769",
    status: "fixed",
    sourceCommits: ["69e60e8ca"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-button-cap",
    scenario: "non-positive-cap",
    startingCap: 3,
    rejectedCaps: [0, -1, 1.5],
  },
});
