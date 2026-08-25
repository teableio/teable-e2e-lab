import { defineBugCase } from "../../framework/types";

// T5480: a column name is a label a person writes, so it contains whatever
// they type - a size in inches, a quoted phrase, a product name with a quote
// in it. The name is carried into the database as an identifier, and an
// identifier with a quotation mark has to be escaped or it ends early.
// Unescaped, the query that fills the worked-out columns in is not the query
// anybody meant.
export default defineBugCase({
  id: "formula/a-column-name-with-a-quotation-mark",
  title: "Columns worked out over a quoted column name compute",
  runner: "quoted-column-name-formula",
  timeoutMs: 240_000,
  bug: {
    issue: "T5480",
    status: "fixed",
    sourceCommits: ["66e3b7296"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-quoted-column",
    quotedColumnName: 'Length in "inches"',
    value: "abcdef",
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
