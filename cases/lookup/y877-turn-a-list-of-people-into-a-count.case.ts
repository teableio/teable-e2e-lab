import { defineBugCase } from "../../framework/types";

// T7144: changing a summary from "the distinct people" to "how many" changes
// what the column holds - words become a number - so the edit carries number
// formatting with it. That formatting was validated against the result type
// the column had BEFORE the edit, where number formatting is not valid, so the
// edit was refused. The person picks "how many" from the same menu that
// offered the list, gets an error, and the only way to a count is deleting the
// column and building it again.
export default defineBugCase({
  id: "lookup/y877-turn-a-list-of-people-into-a-count",
  title: "A summary of borrowed people can be changed into a count",
  runner: "rollup-expression-convert",
  timeoutMs: 180_000,
  bug: {
    issue: "T7144",
    status: "fixed",
    sourceCommits: ["66a69024b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-rollup-convert",
    hostRowName: "Project Atlas",
    linkedRowNames: ["First shift", "Second shift"],
    expressionBefore: "array_unique({values})",
    expressionAfter: "countall({values})",
    precision: 2,
    timeZone: "Asia/Singapore",
  },
});
