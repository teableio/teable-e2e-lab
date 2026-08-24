import { defineBugCase } from "../../framework/types";

// T3303: "has this been filled in yet" is the most common question a formula
// asks about a number - a chase list of quotes without a price, a count of
// forms still missing an amount, a colour rule marking the gaps. Comparing a
// number column against blank did not treat an empty cell as blank, so those
// rows answered like the filled ones: every list built that way is missing
// precisely the rows it exists to find, and it looks like a list with nothing
// in it, which reads as "nothing to chase" rather than "this is broken".
export default defineBugCase({
  id: "formula/is-this-number-filled-in",
  title: "A formula asking whether a number is filled in answers per row",
  runner: "blank-number-formula",
  timeoutMs: 180_000,
  bug: {
    issue: "T3303",
    status: "fixed",
    sourceCommits: ["2d93fbef4"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-blank-number",
    rows: [
      { name: "quote-with-a-price", amount: 1200 },
      { name: "quote-still-blank", amount: null },
      { name: "quote-priced-at-zero", amount: 0 },
    ],
    emptyAnswer: "still to fill in",
    filledAnswer: "done",
  },
});
