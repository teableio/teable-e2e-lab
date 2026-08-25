import { defineBugCase } from "../../framework/types";

// T6509: a row is allowed to have no name yet - the row exists, other rows
// already point at it, and the name column is still blank. Saving a link cell
// that already holds that link, which the interface does whenever a cell is
// confirmed without being changed, stored "the name is nothing" rather than
// storing no name. From then on the cell holds a value the product itself
// refuses to accept, so the person cannot edit that cell at all.
export default defineBugCase({
  id: "link/a-link-to-a-row-with-no-name-yet",
  title: "A link to a row with no name yet stays editable",
  runner: "link-title-empty-primary",
  timeoutMs: 180_000,
  bug: {
    issue: "T6509",
    status: "fixed",
    sourceCommits: ["6c0970d52"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-empty-title",
    hostRowTitle: "the-host-row",
    namedRowTitle: "the-named-row",
  },
});
