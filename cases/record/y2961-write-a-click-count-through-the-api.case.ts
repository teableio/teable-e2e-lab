import { defineBugCase } from "../../framework/types";

// T7733: Writing a button's click count through the record API answered 200 and
// dropped the value.
export default defineBugCase({
  id: "record/y2961-write-a-click-count-through-the-api",
  title: "A click count written through the API lands",
  runner: "button-count-writes",
  timeoutMs: 180_000,
  bug: {
    issue: "T7733",
    status: "fixed",
    sourceCommits: ["fdea29bbe"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-button-write",
    scenario: "api-write",
    rowTitle: "row-1",
    count: 3,
  },
});
