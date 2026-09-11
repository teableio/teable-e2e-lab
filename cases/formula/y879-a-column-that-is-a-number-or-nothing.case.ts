import { defineBugCase } from "../../framework/types";

// T7122, the one-column shape: "if the amount is zero or less, nothing,
// otherwise the amount". The empty branch is a word where the other branch is a
// number, and filling in the existing rows fell over on it - the column arrives
// blank for every row, including the ones that should carry the number. Same
// fault as y878 with no intermediate columns, which is what says the nesting is
// not what matters.
export default defineBugCase({
  id: "formula/y879-a-column-that-is-a-number-or-nothing",
  title: "A column that is a number or nothing fills in either way",
  runner: "formula-branch-error-backfill",
  timeoutMs: 240_000,
  bug: {
    issue: "T7122",
    status: "fixed",
    sourceCommits: ["4a4f14202"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-if-branch-empty-else",
    shape: "empty-else",
    rows: [
      { name: "zero", amount: 0 },
      { name: "positive", amount: 12.5 },
      { name: "blank" },
    ],
    settleTimeoutMs: 60_000,
    pollIntervalMs: 2_000,
  },
});
