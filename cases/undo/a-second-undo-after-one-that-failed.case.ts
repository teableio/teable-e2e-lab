import { defineBugCase } from "../../framework/types";

// T7038: undo walks backwards through what you did, and the place it has walked
// back to was moved BEFORE the step was carried out and never moved back when
// the step failed. A failed undo therefore still counted as done, so the next
// press skipped over it and reversed the step before - one the person had not
// asked to reverse. The failed undo itself is honest and visible; the second
// press is the part that quietly takes something else away.
export default defineBugCase({
  id: "undo/a-second-undo-after-one-that-failed",
  title:
    "A second undo after one that failed retries it, and reaches no further",
  runner: "undo-cursor-after-a-failed-undo",
  timeoutMs: 180_000,
  bug: {
    issue: "T7038",
    status: "fixed",
    sourceCommits: ["130d82efd"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-undo-cursor",
    rowName: "the-row-nobody-asked-to-delete",
    otherRowName: "the-row-that-took-the-value",
    originalCode: "code-first",
    changedCode: "code-second",
  },
});
