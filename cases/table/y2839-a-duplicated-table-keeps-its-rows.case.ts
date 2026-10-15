import { defineBugCase } from "../../framework/types";

// T7783: Copying a table with a row number, a created time and a last-changed
// pair failed half way: the system-filled columns were copied as typed values,
// the database refused a typed row number, and the copy came out with every
// column and no rows. The checkpoint also pins what the copy's rows must say
// about themselves: numbered from 1 without the source's gap, created at copy
// time, and not yet changed by anyone.
export default defineBugCase({
  id: "table/y2839-a-duplicated-table-keeps-its-rows",
  title: "A duplicated table keeps its rows and starts its own history",
  runner: "duplicate-table-system-fields",
  timeoutMs: 180_000,
  bug: {
    issue: "T7783",
    status: "fixed",
    sourceCommits: ["df36def32"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-duplicate-system",
    rows: ["Alpha", "Beta", "Gamma", "Delta"],
    deletedRow: "Beta",
    ageSourceMs: 2000,
  },
});
