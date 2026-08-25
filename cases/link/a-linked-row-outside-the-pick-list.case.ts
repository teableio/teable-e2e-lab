import { defineBugCase } from "../../framework/types";

// T4864: narrowing a link column to one view is how a base keeps people
// picking from the right list - only current suppliers, only this year's
// projects. It is a rule about what can be chosen from now on, and it was read
// as a rule about what can be shown: a row linked before the narrowing, or
// before the other row dropped out of that view on its own, stopped being
// displayed. The panel is blank and the count says nothing is linked, while
// the link is right there in the data.
export default defineBugCase({
  id: "link/a-linked-row-outside-the-pick-list",
  title: "A linked row outside the pick list is still shown",
  runner: "linked-row-outside-the-scope",
  timeoutMs: 180_000,
  bug: {
    issue: "T4864",
    status: "fixed",
    sourceCommits: ["56fe8df36"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-linked-outside-scope",
    hostRowName: "the-order",
    inViewName: "current-supplier",
    outOfViewName: "former-supplier",
  },
});
