import { defineBugCase } from "../../framework/types";

// T6107: taking a default off a column was refused on every type except text.
// A quantity column that starts every new row at 1 is a reasonable thing to
// set up and a reasonable thing to change your mind about; changing your mind
// meant deleting the column and building it again.
export default defineBugCase({
  id: "field/clear-a-number-default",
  title: "A number column's default can be taken away",
  runner: "cleared-default",
  timeoutMs: 180_000,
  bug: { issue: "T6107", status: "fixed", sourceCommits: ["e20392ba4"] },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-default-number",
    column: "number",
    numberDefault: 1,
    timeZone: "UTC",
    choices: ["Todo", "Doing"],
    rowBeforeTitle: "created-before-the-edit",
    rowAfterTitle: "created-after-the-edit",
  },
});
