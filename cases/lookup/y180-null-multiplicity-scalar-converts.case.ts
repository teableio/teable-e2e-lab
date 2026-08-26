import { defineBugCase } from "../../framework/types";

// T6786, the other half: with the lookup's computed updates dead-lettering,
// the way out from inside the product is to convert the broken lookup into a
// plain text field. That hit the same wrong assumption from the other side -
// the conversion ran jsonb_typeof over plain text and answered `invalid input
// syntax for type json`. The table could not compute and could not be
// repaired, which is what turned an outage into a dead end.
export default defineBugCase({
  id: "lookup/y180-null-multiplicity-scalar-converts",
  title:
    "A scalar lookup with unset multiplicity can still be converted to text",
  runner: "null-multiplicity-lookup",
  timeoutMs: 300_000,
  bug: {
    issue: "T6786",
    status: "fixed",
    sourceCommits: ["f72c3ce87"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-null-multiplicity-convert",
    observe: "convert-to-text",
    // Unused by this observation, but the runner refuses equal values so the
    // sibling case cannot be built on a no-op edit by accident.
    sourceValue: "alpha",
    sourceValueAfter: "beta",
    settleTimeoutMs: 60_000,
    settlePollIntervalMs: 1_000,
  },
});
