import { defineBugCase } from "../../framework/types";

// T4864: narrowing a link column to one view is how a base keeps people
// picking from the right list. It is a rule about what can be chosen from now
// on, and it was read as a rule about what can be shown: on the shared page, a
// row linked before the narrowing stopped being displayed. The person looking
// at that page cannot open the base to check, and has no way to tell an empty
// cell from a cell they are not being shown.
export default defineBugCase({
  id: "share/a-linked-row-outside-the-pick-list",
  title: "A shared page shows a linked row outside the pick list",
  runner: "share-view-linked-row",
  timeoutMs: 180_000,
  bug: {
    issue: "T4864",
    status: "fixed",
    sourceCommits: ["56fe8df36"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-share-linked-row",
    hostRowName: "the-order",
    inViewName: "current-supplier",
    outOfViewName: "former-supplier",
  },
});
