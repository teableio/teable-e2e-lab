import { defineBugCase } from "../../framework/types";

// T7080: "orders for this customer that are either unpaid or flagged" is one
// condition with a bracket in it, and the interface builds it as a group inside
// a group. The fast path answering this kind of column read the outer
// conditions and dropped the bracket, so the column counted every row matching
// the customer. The count is wrong upwards and looks ordinary - real rows, right
// customer, wrong ones - nothing marks the column, and reopening it still shows
// the condition in full.
export default defineBugCase({
  id: "lookup/a-condition-with-a-bracket-in-it",
  title: "A condition with a bracket in it counts what the bracket says",
  runner: "nested-group-conditional-rollup",
  timeoutMs: 300_000,
  skipV1:
    "conditional totals are a v2 column type - v1 has no field to ask this of",
  bug: {
    issue: "T7080",
    status: "fixed",
    sourceCommits: ["bfd2d978b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-nested-or-rollup",
    bracketFlagAValue: "no",
    bracketFlagBValue: "yes",
    flatFlagAValue: "yes",
    sourceRows: [
      { name: "a-inside", matchKey: "A", flagA: "yes", flagB: "yes" },
      { name: "a-outside", matchKey: "A", flagA: "yes", flagB: "no" },
      { name: "b-inside", matchKey: "B", flagA: "no", flagB: "no" },
      { name: "b-outside", matchKey: "B", flagA: "yes", flagB: "no" },
    ],
    hosts: [
      { name: "host-a", matchKey: "A" },
      { name: "host-b", matchKey: "B" },
      { name: "host-with-nothing", matchKey: "Z" },
    ],
    settleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
