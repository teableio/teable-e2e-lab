import { defineBugCase } from "../../framework/types";

// Y56 / T6680: protect the expected first-open behavior of a one-many link
// editor. Eligible candidates must load immediately without a tab round trip.
export default defineBugCase({
  id: "link/y56-first-open-candidates-load",
  title: "The first All list immediately exposes eligible link candidates",
  runner: "link-selector-candidates",
  timeoutMs: 240_000,
  bug: {
    issue: "T6680",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/2982",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y56",
    mode: "initial-load",
    targetIssueTitle: "Issue B",
    ownerIssueTitle: "Issue A",
    freeRecordTitle: "Free test case",
    occupiedRecordTitle: "Occupied test case",
  },
});
