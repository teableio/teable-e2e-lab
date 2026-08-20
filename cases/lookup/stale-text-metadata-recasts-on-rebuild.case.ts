import { defineBugCase } from "../../framework/types";

// T6836: a table.update backfill generated its column assignment from the
// lookup's stored metadata. On fields whose metadata had drifted to TEXT while
// the physical column stayed double precision or jsonb, Postgres refused the
// assignment ("column ... is of type jsonb but expression is of type text")
// and the schema operation went dead - non-retryable, invisible to the caller,
// and leaving a lookup column that simply stopped filling in.
export default defineBugCase({
  id: "lookup/stale-text-metadata-recasts-on-rebuild",
  title: "Lookups with drifted TEXT metadata still fill in after a rebuild",
  runner: "stale-lookup-recast",
  timeoutMs: 300_000,
  bug: {
    issue: "T6836",
    status: "fixed",
    sourceCommits: ["5984354a9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-stale-lookup",
    // Both reported mismatches in one case: the number lookup is stored as
    // double precision, the link lookup as jsonb.
    lookups: ["number", "link"],
    trigger: "add-filter",
    sourceNumber: 12.5,
    peerTitle: "peer-a",
    settleTimeoutMs: 60_000,
    settlePollIntervalMs: 1_000,
  },
});
