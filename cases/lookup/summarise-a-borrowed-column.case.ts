import { defineBugCase } from "../../framework/types";

// T7513: summarising a column that is itself borrowed through a link printed
// the joined labels as a list and turned the distinct amounts into text, where
// the same summaries over plain columns were right.
export default defineBugCase({
  id: "lookup/summarise-a-borrowed-column",
  title: "Summaries over a borrowed column match summaries over a plain one",
  runner: "rollup-over-lookup-values",
  timeoutMs: 180_000,
  bug: {
    issue: "T7513",
    status: "fixed",
    sourceCommits: ["10a04576d"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-borrowed-summary",
    items: [
      { label: "Alpha", amount: 15 },
      { label: "Beta", amount: 20 },
    ],
    topRowName: "both",
  },
});
