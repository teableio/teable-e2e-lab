import { defineBugCase } from "../../framework/types";

// T6765: rebuilding a lookup copied its stored db_field_type forward without
// asking whether the shape had changed. Repoint a computed lookup from a date
// field to a text one and the declaration went on saying DATETIME over a text
// column, so the backfill cast text into timestamptz and the schema operation
// died. The column stopped filling in, and nothing was raised to the caller.
export default defineBugCase({
  id: "computed/lookup-repointed-at-another-field",
  title: "Repointing a computed lookup at another field refills it",
  runner: "computed-backfill-recast",
  timeoutMs: 180_000,
  bug: {
    issue: "T6765",
    status: "fixed",
    sourceCommits: ["a9f56d9d5"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-recast-lookup-repoint",
    shape: "lookup-target-changed",
    peerTitle: "note-a",
    sourceNumber: 12.5,
    placeholderNumber: 1,
    rowCount: 40,
    settleTimeoutMs: 45_000,
    settlePollIntervalMs: 750,
  },
});
