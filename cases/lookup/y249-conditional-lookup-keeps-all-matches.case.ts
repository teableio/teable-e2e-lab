import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "lookup/y249-conditional-lookup-keeps-all-matches",
  title: "Y249: A conditional lookup keeps every matching row",
  runner: "conditional-lookup-all-matches",
  timeoutMs: 180_000,
  bug: {
    issue: "sentinel/conditional-lookup-all-matches",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y249",
    matchKey: 249,
    sourceValues: ["match-alpha", "match-beta"],
    settleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
