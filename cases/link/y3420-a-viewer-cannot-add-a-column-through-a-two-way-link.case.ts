import { defineBugCase } from "../../framework/types";

// T8130: Creating a two-way cross-base link only authorized the source table,
// so someone who could only view the foreign base still added the reciprocal
// column to its table.
export default defineBugCase({
  id: "link/y3420-a-viewer-cannot-add-a-column-through-a-two-way-link",
  title:
    "A viewer of the foreign base cannot add a column to it through a two-way link",
  runner: "cross-base-two-way-link-authz",
  timeoutMs: 120_000,
  bug: {
    issue: "T8130",
    status: "fixed",
    sourceCommits: ["909b7b46a"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-two-way-link-authz",
  },
});
