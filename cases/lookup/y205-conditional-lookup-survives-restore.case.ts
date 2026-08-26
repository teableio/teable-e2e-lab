import { defineBugCase } from "../../framework/types";

// T6580: a conditional lookup is how a table reads a value out of another
// table it has no link to - match on a shared reference, pull a column across.
// The condition is the whole field. Restoring one from the trash dropped it,
// so the column that had been showing values went on showing nothing, and the
// only way back was to rebuild the field by hand and remember what its
// condition had been.
export default defineBugCase({
  id: "lookup/y205-conditional-lookup-survives-restore",
  title: "A conditional lookup restored from the trash still reads its values",
  runner: "restore-conditional-lookup",
  timeoutMs: 180_000,
  bug: {
    issue: "T6580",
    status: "fixed",
    sourceCommits: ["11a4fea1e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-conditional-restore",
    rows: [
      { ref: "post-001", value: "thumb-1.png" },
      { ref: "post-002", value: "thumb-2.png" },
    ],
    trashVisibleTimeoutMs: 30_000,
    pollIntervalMs: 500,
  },
});
