import { defineBugCase } from "../../framework/types";

// T2490: a batch write is what every integration sends - a nightly sync
// updating whatever changed, a script writing back a handful of columns, an
// automation touching one thing per row. Different rows carry different
// fields, because only what changed is sent. A column left out of one row's
// part of the write was cleared on that row: nothing failed, nothing was
// reported, and the value is gone from rows the sender never mentioned, while
// the sender's own log says the write succeeded.
export default defineBugCase({
  id: "record/y331-a-batch-write-leaves-what-it-did-not-mention",
  title: "A batch write leaves the columns it did not mention",
  runner: "sparse-batch-update",
  timeoutMs: 180_000,
  bug: {
    issue: "T2490",
    status: "fixed",
    sourceCommits: ["e226a004e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-sparse-write",
    untouchedRowTitle: "row-whose-status-was-not-mentioned",
    writtenRowTitle: "row-whose-status-was-written",
    statusKept: "Open",
    statusWritten: "Closed",
    notesBefore: "before the sync",
    notesAfter: "after the sync",
  },
});
