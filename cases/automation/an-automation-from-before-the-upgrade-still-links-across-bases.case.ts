import { defineBugCase } from "../../framework/types";

// T8375: Automations activated before cross-base reciprocal writes started
// being authorized (#4371) kept failing to write two-way links across bases
// after the upgrade - "Cannot authorize reciprocal target record updates" -
// until someone deactivated and reactivated them. The snapshot they run from
// records nothing about who activated them, and the run falls back to the
// robot's own rights. Fixed by #4419, which rolled back the cross-base
// reciprocal checks; if they return, this case guards the upgrade path.
export default defineBugCase({
  id: "automation/an-automation-from-before-the-upgrade-still-links-across-bases",
  title:
    "An automation activated before the upgrade still writes cross-base two-way links",
  runner: "automation-legacy-reciprocal-link",
  timeoutMs: 240_000,
  bug: {
    issue: "T8375",
    status: "fixed",
    sourceCommits: ["127c132b0"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-legacy-automation-link",
    orderRefs: ["order-1", "order-2"],
    settleTimeoutMs: 60_000,
  },
});
