import { defineBugCase } from "../../framework/types";

// T7024: "everyone involved, listed once, separated by commas" over seven people
// columns, written four functions deep. Each layer re-stated the whole of the
// layer inside it, so the statement the database was asked to plan grew with
// every one, reaching megabytes. The row is recomputed inside the write, so
// nothing came back at all: the page spun and the gateway gave up. The table
// could not accept a row - not slowly, at all - and all a person could see was a
// timeout.
export default defineBugCase({
  id: "record/add-a-row-to-a-table-that-joins-people-columns",
  title: "A row can be added to a table whose formula joins people columns",
  runner: "nested-user-array-join-create",
  timeoutMs: 300_000,
  bug: {
    issue: "T7024",
    status: "fixed",
    sourceCommits: ["2c57b7bd8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-user-array-join",
    peopleColumns: 7,
    peopleColumnPrefix: "Trainer",
    sessionRowName: "the-session",
    campusValue: "the-campus",
    noteRowName: "the-note-being-added",
    // A plain separator. The customer's was an ideographic comma; what grows
    // the statement is the nesting, not the character, and this repository is
    // English-only.
    separator: ", ",
    writeBudgetMs: 60_000,
  },
});
