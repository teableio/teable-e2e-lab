import { defineBugCase } from "../../framework/types";

// T6518: a rating field is whole stars between one and its maximum, and
// converting a number column into one has to answer for every value already
// there. v2's conversion left several as they were, so the column ended up
// holding values it advertises as impossible - and filters, comparisons and
// anything else that trusts the domain disagree with the stars the grid draws.
export default defineBugCase({
  id: "field/rating-conversion-normalizes-existing-values",
  title: "Converting a number column to a rating normalizes what was in it",
  runner: "rating-conversion",
  timeoutMs: 180_000,
  bug: {
    issue: "T6518",
    status: "fixed",
    sourceCommits: ["c086a5091"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-rating-convert",
    ratingMax: 5,
    rows: [
      // A fraction inside the range: rounds to the nearest whole star.
      { name: "fraction", before: 3.6, after: 4 },
      // Past the maximum: clamps to it.
      { name: "over-the-max", before: 9, after: 5 },
      // Below one star: a rating has no zero, so the cell is empty.
      { name: "below-one", before: 0.4, after: null },
      // Already legal, and must come through untouched.
      { name: "already-whole", before: 2, after: 2 },
    ],
  },
});
