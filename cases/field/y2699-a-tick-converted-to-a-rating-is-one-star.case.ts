import { defineBugCase } from "../../framework/types";

// T7845: Converting a checkbox column to a rating gave every ticked row the
// maximum rating instead of one star.
export default defineBugCase({
  id: "field/y2699-a-tick-converted-to-a-rating-is-one-star",
  title: "A checkbox converted to a rating gives a ticked row one star",
  runner: "field-conversion-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7845",
    status: "fixed",
    sourceCommits: ["b7f329e48"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-checkbox-to-rating",
    source: {
      type: "checkbox",
    },
    target: {
      type: "rating",
      options: {
        icon: "star",
        color: "yellowBright",
        max: 5,
      },
    },
    rows: [
      {
        name: "ticked",
        before: true,
        after: 1,
      },
      {
        name: "unticked",
        before: null,
        after: null,
      },
    ],
  },
});
