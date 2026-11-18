import { defineBugCase } from "../../framework/types";

// Declared open: this reproduces on develop.
//
// T8595: Automation scripts lost access to the runtime endpoints for email, AI
// and connection tokens. Each answered 403 "This API can only be called from
// automation scripts" to the script's own token.
export default defineBugCase({
  id: "automation/a-script-can-call-the-automation-runtime",
  title: "An automation script can call the automation runtime endpoints",
  runner: "automation-script-runtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T8595",
    status: "open",
    sourceCommits: ["4af293b86"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-script-runtime",
    scriptTimeoutMs: 60_000,
    callTimeoutMs: 15_000,
    settleTimeoutMs: 90_000,
  },
});
