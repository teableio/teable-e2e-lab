import { defineBugCase } from "../../framework/types";

// T6157: FIND is how a formula asks "does this text contain that". Pointed at
// a multi-select - or a link cell, which is the same shape - the column holds
// several values rather than one string, and the query built for it asked
// Postgres to search inside a jsonb value with a text operator. That fails,
// and it fails the whole computed task, so the formula column never fills in.
// The user's version is short: a formula that works on a text column produces
// nothing at all when pointed at a multi-select, with no error to read.
export default defineBugCase({
  id: "formula/find-searches-a-multi-select",
  title: "A formula can search a multi-select column for a word",
  runner: "find-over-multi-value",
  timeoutMs: 300_000,
  bug: {
    issue: "T6157",
    status: "fixed",
    sourceCommits: ["db020d9ab"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-find-multi",
    needle: "urgent",
    rows: [
      { name: "has-it", tags: ["urgent", "backend"] },
      { name: "does-not", tags: ["backend"] },
    ],
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
