import { defineBugCase } from "../../framework/types";

// T6107: taking a default off a column was refused on every type except text.
// A status column that starts every new row at "Todo" is the most common
// default there is, and the one most likely to be turned off once rows start
// arriving from an import that already knows their status.
export default defineBugCase({
  id: "field/y240-clear-a-select-default",
  title: "A status column's default can be taken away",
  runner: "cleared-default",
  timeoutMs: 180_000,
  bug: { issue: "T6107", status: "fixed", sourceCommits: ["e20392ba4"] },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-default-select",
    column: "singleSelect",
    numberDefault: 1,
    timeZone: "UTC",
    choices: ["Todo", "Doing"],
    rowBeforeTitle: "created-before-the-edit",
    rowAfterTitle: "created-after-the-edit",
  },
});
