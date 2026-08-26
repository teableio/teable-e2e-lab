import { defineBugCase } from "../../framework/types";

// "No duplicates" is a switch, and switches go both ways. Turning it on builds
// something in the database to enforce it; turning it off has to take that
// away, and it did not. What is left is a column whose settings say duplicates
// are fine and whose behaviour says they are not - refused with a message
// about a constraint nobody can find in the interface.
export default defineBugCase({
  id: "field/y228-turning-off-no-duplicates-lets-a-duplicate-in",
  title: "A column that stopped refusing duplicates accepts one",
  runner: "unique-toggle-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "T5386",
    status: "fixed",
    sourceCommits: ["a3067488b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-unique-toggle",
    withLegacyIndex: false,
    code: "SKU-001",
  },
});
