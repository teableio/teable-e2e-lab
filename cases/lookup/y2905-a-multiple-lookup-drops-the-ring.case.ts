import { defineBugCase } from "../../framework/types";

// T7745: A lookup that can return several values inherited its source's ring
// display, which can only draw a single number.
export default defineBugCase({
  id: "lookup/y2905-a-multiple-lookup-drops-the-ring",
  title: "A lookup inherits only the display its cell can draw",
  runner: "lookup-inherited-display",
  timeoutMs: 180_000,
  bug: {
    issue: "T7745",
    status: "fixed",
    sourceCommits: ["34d1cab49"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-lookup-display",
    currencySymbol: "¥",
    precision: 1,
  },
});
