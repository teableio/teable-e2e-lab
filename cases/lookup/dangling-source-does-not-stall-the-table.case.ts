import { defineBugCase } from "../../framework/types";

// T6614: when a field other fields read is deleted, the dependents are meant
// to be marked broken so the engine leaves them alone. Older delete paths did
// not always do that, so bases carry lookups and rollups aimed at a field
// nobody can find - unmarked, because the marking is exactly what did not
// happen. Generating SQL for one answered "Field not found" and killed the
// computed task it belonged to as an obsolete plan, not retried: the one
// broken column took the whole table's computed work with it.
export default defineBugCase({
  id: "lookup/dangling-source-does-not-stall-the-table",
  title:
    "A lookup whose source field is gone does not stall the table it is on",
  runner: "dangling-computed-source",
  timeoutMs: 300_000,
  bug: {
    issue: "T6614",
    status: "fixed",
    sourceCommits: ["dfe6a1ebc"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-dangling-source",
    sourceAmount: 42,
    editedTitle: "edited-after-the-source-went",
    settleTimeoutMs: 60_000,
    pollIntervalMs: 1_000,
  },
});
