import { defineBugCase } from "../../framework/types";

// T5809: a lookup of a date is stored as json rather than as a date, and a
// formula reading one has to unwrap it before treating it as a date. It did
// not, so the computed update failed - and a failed computed task takes the
// table's other computed columns with it, which is why the report was about a
// status column that stopped updating rather than about the formula anyone had
// written.
export default defineBugCase({
  id: "formula/y223-formula-over-a-looked-up-date-follows-a-change",
  title: "A formula over a looked-up date follows the date it reads",
  runner: "formula-over-date-lookup",
  timeoutMs: 300_000,
  bug: {
    issue: "T5809",
    status: "fixed",
    sourceCommits: ["7f51c9d1f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-formula-date-lookup",
    dateBefore: "2026-07-05T00:00:00.000Z",
    dateAfter: "2026-07-08T00:00:00.000Z",
    statusBefore: "Open",
    statusAfter: "Paid",
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
