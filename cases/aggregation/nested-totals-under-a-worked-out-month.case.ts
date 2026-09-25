import { defineBugCase } from "../../framework/types";

// T7561: grouped by a formula that copies a month-formatted date, with a
// second level under it, the group headings whose rows did not sit at the
// very start of the month got no total - the list keyed them by the raw time,
// the totals by the month. The plain date column was fixed earlier (T7060).
export default defineBugCase({
  id: "aggregation/nested-totals-under-a-worked-out-month",
  title: "Every heading under a worked-out month carries its total",
  runner: "date-group-statistics",
  timeoutMs: 180_000,
  bug: {
    issue: "T7561",
    status: "fixed",
    sourceCommits: ["cc45f03dc"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-formula-month-nested",
    unit: "month",
    timeZone: "Asia/Shanghai",
    groupOn: "formula",
    nestBySubject: { choices: ["alpha"] },
    // The first row is the very start of April in Shanghai; the others are
    // not, which is what the missing totals had in common.
    rows: [
      { title: "april-start", amount: 100, at: "2025-03-31T16:00:00.000Z" },
      { title: "april-later", amount: 100, at: "2025-04-01T03:24:09.000Z" },
      {
        title: "april-alpha",
        amount: 40,
        at: "2025-04-10T02:00:00.000Z",
        subject: "alpha",
      },
      { title: "june-later", amount: 70, at: "2025-06-01T03:25:50.000Z" },
    ],
  },
});
