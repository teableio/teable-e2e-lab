import { defineBugCase } from "../../framework/types";

// T7941: A PATCH of one record with an empty set of fields answered 500 instead
// of a validation error.
export default defineBugCase({
  id: "record/y3329-an-empty-update-is-refused",
  title: "An update with no fields is refused as invalid, not a server error",
  runner: "empty-record-patch",
  timeoutMs: 180_000,
  bug: {
    issue: "T7941",
    status: "fixed",
    sourceCommits: ["a95864ca1"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-empty-patch",
    value: "initial",
    expectedCode: "validation_error",
  },
});
