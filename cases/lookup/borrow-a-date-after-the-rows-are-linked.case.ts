import { defineBugCase } from "../../framework/types";

// T6734: the ordinary order of work is to set up the link first - that is the
// part people think about - and add the column that borrows a date across it
// afterwards, once the rows are already connected. Added that way, the column
// stayed empty on every row, with the date sitting one table away and the link
// plainly in place. Nobody suspects the order they did things in.
export default defineBugCase({
  id: "lookup/borrow-a-date-after-the-rows-are-linked",
  title: "A date borrowed after the rows are linked arrives",
  runner: "date-lookup-backfill",
  timeoutMs: 240_000,
  bug: {
    issue: "T6734",
    status: "fixed",
    sourceCommits: ["d28589d10"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-date-lookup-backfill",
    hostRowName: "the-submission",
    closeDate: "2026-01-15T00:00:00.000Z",
    // Adding the column next to an existing link is green on both columns,
    // run 32836154719; this is the shape where the host had its own date
    // column first.
    shape: "convertExisting" as const,
    ownDate: "2025-11-02T00:00:00.000Z",
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
