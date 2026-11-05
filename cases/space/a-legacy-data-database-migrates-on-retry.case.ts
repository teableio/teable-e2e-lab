import { defineBugCase } from "../../framework/types";

// T8358: Data-database migrations for bring-your-own-database spaces were
// sent through a query builder that rewrote every "?" in the SQL as a bind
// placeholder. A migration whose SQL uses "?" then failed its own safety
// check, the connection went to error, and the space's tables stopped opening.
export default defineBugCase({
  id: "space/a-legacy-data-database-migrates-on-retry",
  title:
    "A bring-your-own data database in a legacy state migrates and stays readable",
  runner: "byodb-migration-retry",
  timeoutMs: 240_000,
  bug: {
    issue: "T8358",
    status: "fixed",
    sourceCommits: ["3510cb071"],
  },
  config: {
    baseId: "own-space",
    namePrefix: "e2e-lab-byodb-retry",
    pendingMigrationId: "20261104000000_gate_inactive_undo_capture",
  },
});
