import { defineBugCase } from "../../framework/types";

// T7064: a conditional column reading a table in another base needs to record
// which base that is. It was dropped on the way into storage, so reopening the
// column's settings found a foreign table it could not place and drew it as a
// table the person has no permission to see. The values kept arriving - only
// the settings could no longer describe themselves, which costs the ability to
// change the column at all.
export default defineBugCase({
  id: "field/a-cross-base-conditional-column-keeps-its-base",
  title: "A conditional column reading another base still names that base",
  runner: "cross-base-conditional-base-id",
  timeoutMs: 300_000,
  bug: {
    issue: "T7064",
    status: "fixed",
    sourceCommits: ["e552c5e88"],
  },
  config: {
    namePrefix: "e2e-lab-cross-base-conditional",
    matchedCategory: "hardware",
    sourceRows: [
      { category: "hardware", amount: 100 },
      { category: "hardware", amount: 50 },
      { category: "software", amount: 70 },
    ],
  },
});
