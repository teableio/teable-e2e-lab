import { defineBugCase } from "../../framework/types";

// T6959: this is how a plain counter becomes a reference someone can quote on
// the phone - the case numbers were 1, 2, 3 and should now read C-001, C-002,
// C-003. The column's storage was made for numbers and the new rule produces
// text, so the pass that fills the column in failed where nobody could see it:
// the column sat empty, with nothing on screen explaining why.
export default defineBugCase({
  id: "field/turn-a-number-column-into-a-reference-code",
  title: "A number column becomes a worked-out reference code",
  runner: "number-to-text-formula",
  timeoutMs: 240_000,
  bug: {
    issue: "T6959",
    status: "fixed",
    sourceCommits: ["aaa9ac78d"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-reference-code",
    numbers: [1, 2, 3],
    expression:
      'CONCATENATE("C-", RIGHT(CONCATENATE("000", AUTO_NUMBER()), 3))',
    expectedPattern: "^C-\\d{3}$",
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
