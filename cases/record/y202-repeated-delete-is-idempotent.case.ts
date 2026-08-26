import { defineBugCase } from "../../framework/types";

// T6586: deleting records that are already gone answered an error instead of
// doing nothing. A delete is the operation a client retries most readily - a
// dropped response, a double click, a sync job replaying its queue - and the
// second attempt reporting failure makes a completed delete look like a
// broken one.
export default defineBugCase({
  id: "record/y202-repeated-delete-is-idempotent",
  title: "Deleting records that are already gone answers success, not an error",
  runner: "delete-collateral",
  timeoutMs: 180_000,
  bug: {
    issue: "T6586",
    status: "fixed",
    sourceCommits: ["2406c6c59"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-repeat-delete",
    variant: "repeatedDelete",
    rowCount: 3,
    keptValuePrefix: "keep",
  },
});
