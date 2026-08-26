import { defineBugCase } from "../../framework/types";

// T6668: archiving is how a team puts finished work away without losing it.
// The rows leave the table, but the columns counting them did not come down. A
// column reading "3 open items" over a table with no open items left is not a
// stale number somebody notices and refreshes - it is the number the team
// plans around, and nothing on screen suggests it disagrees with the rows.
export default defineBugCase({
  id: "record/y1-archive-the-rows-a-count-was-counting",
  title: "Archiving the rows a count was counting brings the count down",
  runner: "archive-recount",
  timeoutMs: 240_000,
  bug: {
    issue: "T6668",
    status: "fixed",
    sourceCommits: ["727f58360"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-archive-recount",
    owners: ["owner-a", "owner-b", "owner-c"],
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
