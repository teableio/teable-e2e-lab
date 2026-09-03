import { defineBugCase } from "../../framework/types";

// T7004: a total over linked rows narrowed to "status is todo OR status is
// doing". Written with OR, the condition escaped the link - the query stopped
// asking "and linked to this row" and totalled every matching row in the other
// table. The number that came out was a real sum of real rows, so nothing
// looked broken; the tell in the report is a project joined to nothing that
// already shows other people's figures.
export default defineBugCase({
  id: "lookup/an-any-of-these-total-stays-inside-its-link",
  title: "An any-of-these total counts only the rows this one is linked to",
  runner: "or-filtered-rollup-scope",
  timeoutMs: 300_000,
  bug: {
    issue: "T7004",
    status: "fixed",
    sourceCommits: ["8713707c2"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-or-rollup-scope",
    linkedHost: "the-project-with-work",
    unlinkedHost: "the-project-joined-to-nothing",
    selectedStatuses: ["todo", "doing"],
    work: [
      {
        name: "mine-todo",
        owner: "the-project-with-work",
        status: "todo",
        amount: 10,
      },
      {
        name: "mine-doing",
        owner: "the-project-with-work",
        status: "doing",
        amount: 20,
      },
      {
        name: "mine-done",
        owner: "the-project-with-work",
        status: "done",
        amount: 30,
      },
      {
        name: "theirs-todo",
        owner: "somebody-else",
        status: "todo",
        amount: 400,
      },
      {
        name: "theirs-doing",
        owner: "somebody-else",
        status: "doing",
        amount: 500,
      },
    ],
    settleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
