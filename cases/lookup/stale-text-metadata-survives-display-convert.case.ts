import { defineBugCase } from "../../framework/types";

// T6805: the same drifted-TEXT metadata, reached by the weaker trigger. A
// display-only convert changes nothing about which values belong in the
// column, but it still rebuilds a pending lookup - and the rebuild assigned
// text into a double precision column, killing the table.update schema
// operation (Sentry BACKEND-AI-1F6). The stored metadata has to be treated as
// stale rather than authoritative even when the request cannot have moved a
// single value.
export default defineBugCase({
  id: "lookup/stale-text-metadata-survives-display-convert",
  title:
    "A display-only convert rebuilds a drifted lookup without a type mismatch",
  runner: "stale-lookup-recast",
  timeoutMs: 300_000,
  bug: {
    issue: "T6805",
    status: "fixed",
    sourceCommits: ["bff3e2622"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-stale-lookup-display",
    // Number only: the reported column was double precision, and a link
    // lookup has no formatting for a display-only convert to change.
    lookups: ["number"],
    trigger: "display-only",
    sourceNumber: 12.5,
    peerTitle: "peer-a",
    settleTimeoutMs: 60_000,
    settlePollIntervalMs: 1_000,
  },
});
