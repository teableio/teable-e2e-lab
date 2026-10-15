import { defineBugCase } from "../../framework/types";

// T7768: Turning off a button's click cap left a cap of 0 and "allow reset"
// still on, because clearing the cap was not expressible - a cleared cap was
// refused - so the editor stored 0 instead.
export default defineBugCase({
  id: "field/y2804-turning-off-the-click-cap",
  title: "Turning off a button's click cap turns reset off with it",
  runner: "button-click-cap",
  timeoutMs: 180_000,
  bug: {
    issue: "T7768",
    status: "fixed",
    sourceCommits: ["69e60e8ca"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-button-cap-off",
    scenario: "cap-turned-off",
    startingCap: 3,
    rejectedCaps: [],
  },
});
