import { defineBugCase } from "../../framework/types";

// T5419: a link cell carries the id of the row it points at and that row's
// title - the title is what the grid draws. Whoever just wrote the cell reads
// the answer to their own write and puts it on screen, so a reply carrying the
// id alone leaves the cell they are looking at blank until something else
// refreshes it.
export default defineBugCase({
  id: "link/write-answers-with-the-linked-row-name",
  title: "Setting a link answers with the name of the row it points at",
  runner: "link-title-in-update-response",
  timeoutMs: 180_000,
  bug: {
    issue: "T5419",
    status: "fixed",
    sourceCommits: ["32a509014"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-title-reply",
    foreignRowTitle: "Dana Whitfield",
  },
});
