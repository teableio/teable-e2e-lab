import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "filter/y339-multi-user-lookup-filter-contract",
  title: "Y339: A multi-user lookup accepts its multi-value filter",
  runner: "lookup-user-filter-contract",
  timeoutMs: 180_000,
  bug: {
    issue: "T6943",
    status: "fixed",
    sourceCommits: ["358787f97"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y339",
    matchedTitle: "linked-to-current-user",
    unmatchedTitle: "not-linked",
  },
});
