import { defineBugCase } from "../../framework/types";

// T4929: deleting a column a formula reads leaves the formula marked broken,
// which is right. Repointing it at another column is the repair - and the
// repair was accepted without the mark being cleared, so the column keeps its
// warning and its old values with nothing further the user can do to it. Two
// people then disagree about whether the base is healthy: whoever repaired it
// knows it is fine, everyone else sees a column flagged as broken.
export default defineBugCase({
  id: "formula/y246-repairing-a-formula-clears-its-error",
  title: "Repairing a formula clears the error it was marked with",
  runner: "formula-error-repair",
  timeoutMs: 180_000,
  bug: {
    issue: "T4929",
    status: "fixed",
    sourceCommits: ["7671d624b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-formula-repair",
    rowTitle: "the-row",
    sourceValue: "FROM THE DELETED COLUMN",
    fallbackValue: "FROM THE NEW COLUMN",
  },
});
