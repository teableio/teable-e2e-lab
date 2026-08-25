import { defineBugCase } from "../../framework/types";

// T4128: "show the amount only when it is over the threshold" is an ordinary
// column to write, and it is deliberately blank on most rows - that is what
// makes it readable. The rule produced an empty piece of text where a number
// was expected, which is neither a number nor nothing, and the column could
// not be filled in at all: the rows that did have a number lost it too, over a
// rule that was only ever about the other rows.
export default defineBugCase({
  id: "formula/a-number-column-blank-on-some-rows",
  title: "A worked-out number column may be blank on some rows",
  runner: "blank-number-formula",
  timeoutMs: 240_000,
  bug: {
    issue: "T4128",
    status: "fixed",
    sourceCommits: ["029085053"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-blank-number-formula",
    amounts: [20, 5, 40],
    threshold: 10,
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
