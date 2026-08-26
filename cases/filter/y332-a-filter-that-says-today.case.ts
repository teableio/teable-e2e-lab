import { defineBugCase } from "../../framework/types";

// T3037: a relative filter is the only kind that keeps working tomorrow. "Due
// today", "this week", "in the last month" are how a working view is written,
// because a fixed date is wrong the next morning. Asking for today was not
// understood, so the answer was everything or nothing - and both are quiet: a
// view showing every row looks like one somebody forgot to filter, an empty
// one looks like a quiet day.
export default defineBugCase({
  id: "filter/y332-a-filter-that-says-today",
  title: "A filter that says today answers with today",
  runner: "is-within-today-filter",
  timeoutMs: 180_000,
  bug: {
    issue: "T3037",
    status: "fixed",
    sourceCommits: ["221ef8155"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-today-filter",
    yesterdayRowTitle: "due-yesterday",
    todayRowTitle: "due-today",
    tomorrowRowTitle: "due-tomorrow",
    timeZone: "UTC",
  },
});
