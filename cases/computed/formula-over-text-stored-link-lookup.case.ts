import { defineBugCase } from "../../framework/types";

// T6767: a lookup of a link field whose column is a leftover TEXT one holds
// its titles as text. A formula written over that lookup backfilled with a
// hard ::jsonb cast and died on "invalid input syntax for type json", so the
// formula column stayed empty while the lookup beside it read fine.
export default defineBugCase({
  id: "computed/formula-over-text-stored-link-lookup",
  title: "A formula over a text-stored link lookup fills in",
  runner: "computed-backfill-recast",
  timeoutMs: 180_000,
  bug: {
    issue: "T6767",
    status: "fixed",
    sourceCommits: ["e94ae6db2"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-recast-text-lookup-formula",
    shape: "text-lookup-then-formula",
    peerTitle: "peer-a",
    sourceNumber: 12.5,
    placeholderNumber: 1,
    settleTimeoutMs: 45_000,
    settlePollIntervalMs: 750,
  },
});
