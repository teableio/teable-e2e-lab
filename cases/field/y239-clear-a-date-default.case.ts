import { defineBugCase } from "../../framework/types";

// T6107: taking a default off a column was refused on every type except text.
// A date column that fills every new row in with a date is set up once and
// regretted later - when the rows stop all belonging to the same day. Undoing
// it meant deleting the column and building it again.
export default defineBugCase({
  id: "field/y239-clear-a-date-default",
  title: "A date column's default can be taken away",
  runner: "cleared-default",
  timeoutMs: 180_000,
  bug: { issue: "T6107", status: "fixed", sourceCommits: ["e20392ba4"] },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-default-date",
    column: "date",
    numberDefault: 1,
    timeZone: "UTC",
    choices: ["Todo", "Doing"],
    rowBeforeTitle: "created-before-the-edit",
    rowAfterTitle: "created-after-the-edit",
  },
});
