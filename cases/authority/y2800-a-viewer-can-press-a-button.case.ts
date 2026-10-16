import { defineBugCase } from "../../framework/types";

// T7780: Pressing a button counts the press on the row, and that was treated as
// the viewer editing the row, so every press by a read-only collaborator was
// refused.
export default defineBugCase({
  id: "authority/y2800-a-viewer-can-press-a-button",
  title:
    "A viewer can press a workflow button without being able to edit the row",
  runner: "viewer-button-click",
  timeoutMs: 180_000,
  bug: {
    issue: "T7780",
    status: "fixed",
    sourceCommits: ["351faba83"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-viewer-button",
  },
});
