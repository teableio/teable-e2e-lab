import { defineBugCase } from "../../framework/types";

// T1710: the time zone a date is displayed in is a display setting. Changing
// it says nothing about how the date is arrived at - the person is making the
// column readable for a team in another country, not editing their formula.
// Their formula was replaced with the time the row was last touched: a
// plausible-looking date on every row, and the rule they wrote is not
// recoverable from anywhere on screen.
export default defineBugCase({
  id: "formula/change-only-the-time-zone-a-date-is-shown-in",
  title: "Changing only the time zone keeps the rule that works a date out",
  runner: "formula-timezone-only-update",
  timeoutMs: 180_000,
  bug: {
    issue: "T1710",
    status: "fixed",
    sourceCommits: ["850931c78"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-formula-timezone",
    startsAt: "2026-03-01T09:07:11.000Z",
    timeZone: "UTC",
    newTimeZone: "Asia/Shanghai",
    shownBefore: "2026-03-01 09:07:11",
    shownAfter: "2026-03-01 17:07:11",
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
