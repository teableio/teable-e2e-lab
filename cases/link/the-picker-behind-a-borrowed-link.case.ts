import { defineBugCase } from "../../framework/types";

// T6942: clicking a link cell opens a list of rows to choose from. For a
// column that borrows a link from another table, the table that list comes
// from is written one level deeper - only the borrowed column knows which
// table it reaches. The picker looked in the shallower place, found nothing,
// and asked the database for a table with no id. The person sees a picker that
// will not open on one particular column, with no way to tell that column
// apart from the ones that work.
export default defineBugCase({
  id: "link/the-picker-behind-a-borrowed-link",
  title: "The picker behind a borrowed link opens",
  runner: "link-picker-share-lookup",
  timeoutMs: 180_000,
  bug: {
    issue: "T6942",
    status: "fixed",
    sourceCommits: ["cf9c5f5c1"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-borrowed-link-picker",
    targetRowName: "the-target-row",
  },
});
