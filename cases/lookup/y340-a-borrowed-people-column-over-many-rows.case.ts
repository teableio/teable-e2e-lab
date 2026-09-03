import { defineBugCase } from "../../framework/types";

// T6941: a column borrowing from a one-to-many link necessarily holds a list -
// one row here reaches many rows there. The product's own description of that
// column said it holds one, so the grid drew a list of people as a single
// person and the cell went blank on the next refresh. The stored value was
// there the whole time; nothing a person can see is wrong.
export default defineBugCase({
  id: "lookup/y340-a-borrowed-people-column-over-many-rows",
  title: "A borrowed people column over many rows says it holds several",
  runner: "lookup-multiplicity-vo",
  timeoutMs: 180_000,
  bug: {
    issue: "T6941",
    status: "fixed",
    sourceCommits: ["39edca9d4"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-borrowed-people",
    hostRowName: "the-host-row",
    linkedRowNames: ["staff-a", "staff-b"],
  },
});
