import { defineBugCase } from "../../framework/types";

// T6705: deleting the row a required manyOne link points at was allowed. The
// foreign key was ON DELETE SET NULL, so the row went, a computed seed task
// rebuilt the host table's link display cache, the join missed, and the
// generated UPDATE wrote NULL into a NOT NULL display column. Postgres raised
// 23502 and the task dead-lettered on the first attempt - the source write had
// already committed, so the base kept a required link with nothing on the
// other end, repairable only from the admin dead-letter page.
export default defineBugCase({
  id: "link/required-link-blocks-owner-delete",
  title: "Deleting the row a required link points at is refused",
  runner: "required-link-blocks-delete",
  timeoutMs: 180_000,
  bug: {
    issue: "T6705",
    status: "fixed",
    sourceCommits: ["6e581ee04"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-required-link-delete",
    ownerTitle: "owner-row",
    hostTitle: "host-row",
  },
});
