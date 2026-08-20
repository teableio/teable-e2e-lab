import { defineBugCase } from "../../framework/types";

// Y152 / T6851: resolving an automation array node always joined its values
// into text. A single numeric percentage variable therefore lost its type on
// the way into a create-record action.
export default defineBugCase({
  id: "automation/y152-percent-mapping-preserves-number",
  title: "A single-variable percentage mapping preserves its numeric value",
  runner: "automation-percent-mapping",
  timeoutMs: 180_000,
  bug: {
    issue: "T6851",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3078",
  },
  config: {
    spaceNamePrefix: "e2e-lab-y152-space",
    baseNamePrefix: "e2e-lab-y152-base",
    tableNamePrefix: "e2e-lab-y152-percent",
    percentValue: 0.18,
    precision: 2,
    settleTimeoutMs: 30_000,
    settlePollIntervalMs: 250,
  },
});
