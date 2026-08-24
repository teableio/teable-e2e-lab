import { defineBugCase } from "../../framework/types";

// T6912: an ordinary payroll shape - rate rows roll up into an employee's
// highest rate, a payroll line borrows that rate and the employee's site, and
// the view is filtered by site. Nothing is damaged and every column is made
// the way the field dialog makes it, but the looked-up total is stored without
// the settings that say what it totals, and the payroll table stops loading
// altogether: the view will not open, with a message about a rule the person
// never wrote.
export default defineBugCase({
  id: "view/a-payroll-view-over-a-looked-up-total",
  title: "A payroll view opens over a looked-up total",
  runner: "lookup-of-rollup-view-open",
  timeoutMs: 240_000,
  bug: {
    issue: "T6912",
    status: "fixed",
    sourceCommits: ["d36e266aa"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-payroll-view",
    employeeName: "the-employee",
    payrollLineTitle: "the-payroll-line",
    sites: ["north-site", "south-site"],
    rate: 40,
  },
});
