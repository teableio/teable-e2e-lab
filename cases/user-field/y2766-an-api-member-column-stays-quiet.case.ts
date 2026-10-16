import { defineBugCase } from "../../framework/types";

// T7864: A member column created through the API without saying whether to
// notify defaulted to notifying, so assigning people in it sent them
// notifications nobody had switched on.
export default defineBugCase({
  id: "user-field/y2766-an-api-member-column-stays-quiet",
  title:
    "A member column created through the API without a notify choice does not notify",
  runner: "user-field-notify-default",
  timeoutMs: 180_000,
  bug: {
    issue: "T7864",
    status: "fixed",
    sourceCommits: ["a60a3fac1"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-notify-default",
    quietWindowMs: 10000,
  },
});
