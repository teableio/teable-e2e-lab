import { defineBugCase } from "../../framework/types";

// T6515: a rating field is whole stars by definition, and typecast stored a
// fractional value as written. 2.7 sat in a column whose domain says 1 to 5
// integers, so filters and comparisons that trust that domain disagreed with
// what the grid drew.
export default defineBugCase({
  id: "record/y209-rating-is-stored-in-whole-stars",
  title: "A fractional rating is rounded into the field's own domain",
  runner: "value-normalization",
  timeoutMs: 180_000,
  bug: {
    issue: "T6515",
    status: "fixed",
    sourceCommits: ["03831c32a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-rating-domain",
    variant: "ratingFraction",
    writtenValue: 2.7,
    expectedStored: 3,
    ratingMax: 5,
  },
});
