import { defineBugCase } from "../../framework/types";

// T6262: a button column records how many times each row's button has been
// pressed, and the column's settings cap that count. Renaming the button,
// recolouring it, changing the cap or adding a confirmation dialog is
// presentation - the sort of edit made while tidying a base up. It was treated
// as a change to what the column holds, so every row's count was rewritten:
// a button capped at one press per row becomes pressable again on every row at
// once, and the record of who already ran it is gone.
export default defineBugCase({
  id: "field/y235-button-rename-keeps-click-counts",
  title: "Renaming a button keeps the clicks recorded against it",
  runner: "button-display-change",
  timeoutMs: 180_000,
  bug: {
    issue: "T6262",
    status: "fixed",
    sourceCommits: ["8a28b6cbb"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-button-rename",
    rowTitles: ["first-row", "second-row", "third-row"],
    seededCount: 3,
    labelBefore: "Run",
    labelAfter: "Launch",
    colorBefore: "tealBright",
    colorAfter: "blueBright",
    maxCountBefore: 5,
    maxCountAfter: 8,
    confirmTitle: "Confirm launch",
    confirmDescription: "Launch now?",
  },
});
