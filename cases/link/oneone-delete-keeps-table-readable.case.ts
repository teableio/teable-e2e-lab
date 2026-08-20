import { defineBugCase } from "../../framework/types";

// T6807: the non-hosting side of a two-way oneOne link resolved its foreign
// key name to `__id`, the record id column of the table that hosts the real
// foreign key. Its schema rules aimed there: creating the link added a self-FK
// and a unique index on `__id`, and deleting the link dropped the column
// outright. Every record read selects `__id`, so the table stopped answering
// entirely - production saw it as a 42703 from the comment-count endpoint.
export default defineBugCase({
  id: "link/oneone-delete-keeps-table-readable",
  title:
    "Deleting one side of a two-way oneOne link leaves both tables readable",
  runner: "link-delete-readable",
  timeoutMs: 180_000,
  bug: {
    issue: "T6807",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-oneone-delete",
    // The symmetric side owns no physical column of its own, which is what led
    // its rules at `__id`. Deleting the hosting side was always correct.
    deletedSide: "symmetric",
    hostRowTitle: "host-row",
    foreignRowTitle: "foreign-row",
  },
});
