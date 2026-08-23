import { defineBugCase } from "../../framework/types";

// T6759 through the grid's own paste, addressed by column position rather
// than by field id. The reported failure came in on paste-by-id; the write
// path underneath is shared, and whether the range paste fails the same way is
// what this case measures. The ordinary columns in the selection are refused
// along with the pending one, so one leftover field turns a region of the
// table read-only with nothing in the grid to say which column is the
// problem.
export default defineBugCase({
  id: "selection/paste-across-pending-field",
  title:
    "Pasting across a leftover pending field still writes the columns beside it",
  runner: "paste-over-pending-field",
  timeoutMs: 180_000,
  bug: {
    issue: "T6759",
    status: "fixed",
    sourceCommits: ["da2f98547"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-pending-range",
    paste: "range",
    firstValue: "pasted-first",
    lastValue: "pasted-last",
  },
});
