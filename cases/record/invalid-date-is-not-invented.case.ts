import { defineBugCase } from "../../framework/types";

// T6517: a date that does not exist was rolled forward to one that does.
// February 30th became March 2nd, silently, and the row then carried a date
// nobody entered - in a column people filter and sort on. Typecast is the
// path an import or a paste takes, so this arrives in bulk or not at all.
export default defineBugCase({
  id: "record/invalid-date-is-not-invented",
  title: "A date that does not exist is refused, not rolled forward",
  runner: "value-normalization",
  timeoutMs: 180_000,
  bug: {
    issue: "T6517",
    status: "fixed",
    sourceCommits: ["836306b00"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-invalid-date",
    variant: "invalidDate",
    writtenValue: "2026-02-30",
    expectedStored: null,
    ratingMax: 5,
  },
});
