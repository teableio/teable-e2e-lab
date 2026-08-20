import { defineBugCase } from "../../framework/types";

// Y57 / T6679: Selected cleared the one-many candidate filter, and returning
// to All did not restore it. The occupied child then looked selectable until
// the backend rejected the attempted link.
export default defineBugCase({
  id: "link/y57-candidate-filter-survives-tabs",
  title: "The All list keeps occupied one-many children out after a tab switch",
  runner: "link-selector-candidates",
  timeoutMs: 240_000,
  bug: {
    issue: "T6679",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/2982",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y57",
    targetIssueTitle: "Issue B",
    ownerIssueTitle: "Issue A",
    freeRecordTitle: "Free test case",
    occupiedRecordTitle: "Occupied test case",
  },
});
