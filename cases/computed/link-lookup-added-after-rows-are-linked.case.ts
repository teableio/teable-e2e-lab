import { defineBugCase } from "../../framework/types";

// T6770: adding a lookup of a link field to a table whose rows are already
// linked seeds it with one backfill. That backfill assigned a text-typed
// alias into a jsonb column - the earlier repair recast every projection
// except the json ones - and the schema operation went dead, leaving the new
// column empty on exactly the rows that had something to show.
export default defineBugCase({
  id: "computed/link-lookup-added-after-rows-are-linked",
  title: "A link lookup added over existing links seeds its values",
  runner: "computed-backfill-recast",
  timeoutMs: 180_000,
  bug: {
    issue: "T6770",
    status: "fixed",
    sourceCommits: ["228be9ffa"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-recast-link-lookup-seed",
    shape: "one-one-link-lookup",
    peerTitle: "related-a",
    sourceNumber: 12.5,
    placeholderNumber: 1,
    settleTimeoutMs: 45_000,
    settlePollIntervalMs: 750,
  },
});
