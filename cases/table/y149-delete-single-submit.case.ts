import { defineBugCase } from "../../framework/types";

// Y149 / T6827: the table-delete confirmation stayed interactive while its
// request was pending, so repeated clicks sent duplicate deletes and surfaced
// a misleading node-not-found error after the first request succeeded.
export default defineBugCase({
  id: "table/y149-delete-single-submit",
  title: "A pending table deletion is loading, disabled, and submitted once",
  runner: "table-delete-single-submit",
  timeoutMs: 240_000,
  bug: {
    issue: "T6827",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3058",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y149",
    recordCount: 8,
    duplicateProbeMs: 400,
  },
});
