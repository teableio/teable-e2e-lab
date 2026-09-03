import { defineBugCase } from "../../framework/types";

// T1972: where the week starts is not a preference about wording. Most of the
// world works Monday to Sunday, and a column that numbers the days is used to
// sort and group by weekday - a rota, a delivery schedule, a weekly report.
// The instruction was ignored and every day came back numbered from Sunday, so
// everything built on the column is off by one day: the numbers are plausible,
// consistent with each other, and only wrong if someone checks a date they
// know the answer for.
export default defineBugCase({
  id: "formula/y563-a-day-number-when-weeks-start-on-monday",
  title: "A day number counts from the day the week starts",
  runner: "weekday-start-day",
  timeoutMs: 240_000,
  bug: {
    issue: "T1972",
    status: "fixed",
    sourceCommits: ["3b4d18d81"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-weekday-start",
    // A Tuesday: the second day of a week that starts on Monday, the third of
    // one that starts on Sunday.
    date: "2025-04-15T10:20:30.000Z",
    fromMonday: 1,
    fromSunday: 2,
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
