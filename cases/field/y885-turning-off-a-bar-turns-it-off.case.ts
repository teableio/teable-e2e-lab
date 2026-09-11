import { defineBugCase } from "../../framework/types";

// T7238: "show as" is how a number column stops being a number on screen and
// becomes a bar. Turning it off is the same menu the other way - the settings
// are saved without it, and the request that reaches the server says so
// explicitly. That clearing was dropped on the way in and the change was
// reported as nothing to do: the dialog closes, the column is still a bar, and
// doing it again does the same thing.
export default defineBugCase({
  id: "field/y885-turning-off-a-bar-turns-it-off",
  title: "Turning off a number column's bar turns it off",
  runner: "number-show-as-cleared",
  timeoutMs: 180_000,
  bug: {
    issue: "T7238",
    status: "fixed",
    sourceCommits: ["00ca18746"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-number-show-as",
    rowTitle: "the-row",
    precision: 0,
    maxValue: 100,
  },
});
