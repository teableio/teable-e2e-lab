import { defineBugCase } from "../../framework/types";

// T6759, the reported shape: one person could not paste in a base where
// everyone else could. The base carried an active computed field marked
// pending whose physical column had never been provisioned, and the non-stream
// paste-by-id endpoint answered 500 - Postgres 42703, the column does not
// exist. Fields here are addressed by id rather than by column position.
export default defineBugCase({
  id: "selection/paste-by-id-across-pending-field",
  title:
    "Pasting by id across a leftover pending field writes the fields beside it",
  runner: "paste-over-pending-field",
  timeoutMs: 180_000,
  bug: {
    issue: "T6759",
    status: "fixed",
    sourceCommits: ["da2f98547"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-pending-byid",
    paste: "byId",
    firstValue: "pasted-first",
    lastValue: "pasted-last",
  },
});
