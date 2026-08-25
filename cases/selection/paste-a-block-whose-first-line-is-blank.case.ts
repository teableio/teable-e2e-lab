import { defineBugCase } from "../../framework/types";

// T5268: a blank first line is not a mistake - it is what a person copies when
// the top row of their selection has nothing in that column. The blank means
// "empty this one", the same as every other value means "put this here".
// Dropping it shifts everything up by a row, and nothing about that is
// visible: the right number of rows are touched, the values are the ones that
// were copied, and each is one row from where it belongs.
export default defineBugCase({
  id: "selection/paste-a-block-whose-first-line-is-blank",
  title: "A blank first line empties the row it lands on",
  runner: "paste-leading-empty-rows",
  timeoutMs: 180_000,
  bug: {
    issue: "T5268",
    status: "fixed",
    sourceCommits: ["93d97c3ba"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-leading-blank",
    pastedValues: ["pasted-second", "pasted-third"],
    existingPrefix: "already-here",
  },
});
