import { defineBugCase } from "../../framework/types";

// T1970: "how many days since we heard from them", "how old is this ticket" -
// the unit is the question. Nobody asks how long ago something was and means
// seconds; naming a unit is how you get a number a person can read at a glance
// and compare against a policy. The unit was ignored and every answer came
// back in seconds: a six-figure number where a small one was expected, and any
// rule written against the column fires on everything or nothing.
export default defineBugCase({
  id: "formula/y583-how-long-ago-in-days",
  title: "How long ago answers in the unit it was asked for",
  runner: "fromnow-unit",
  timeoutMs: 240_000,
  bug: {
    issue: "T1970",
    status: "fixed",
    sourceCommits: ["c2c072873"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-how-long-ago",
    date: "2020-01-15T00:00:00.000Z",
    minimumDaysAgo: 365,
    // The answer moves with today's date, so both are compared loosely - the
    // failure this guards is off by a factor of tens of thousands.
    dayTolerance: 2,
    hourTolerance: 48,
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
