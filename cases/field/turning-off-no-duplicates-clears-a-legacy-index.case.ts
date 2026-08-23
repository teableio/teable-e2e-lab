import { defineBugCase } from "../../framework/types";

// T5386, the other half: a base can carry a second, standalone unique index
// over the same column, named the way an older version named them. Switching
// the column's constraint off did not know about it, so duplicates went on
// being refused - by an index the current code would never have written.
export default defineBugCase({
  id: "field/turning-off-no-duplicates-clears-a-legacy-index",
  title: "Switching off no-duplicates clears an index an older version left",
  runner: "unique-toggle-cleanup",
  timeoutMs: 180_000,
  bug: {
    issue: "T5386",
    status: "fixed",
    sourceCommits: ["a5a492ca9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-unique-legacy",
    withLegacyIndex: true,
    code: "SKU-001",
  },
});
