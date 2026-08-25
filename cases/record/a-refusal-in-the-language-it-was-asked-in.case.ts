import { defineBugCase } from "../../framework/types";

// T6310: the message on a refused write is the whole of what a person gets -
// the only place the product explains what it will not do and why. A team
// working in their own language reads every other part of the interface in it,
// and then the one sentence that matters arrives in English. "This value is
// already used" is an instruction, and a person who cannot read it has to
// guess, ask a colleague, or give up on the entry.
export default defineBugCase({
  id: "record/a-refusal-in-the-language-it-was-asked-in",
  title: "A refusal arrives in the language it was asked in",
  runner: "localized-error-message",
  timeoutMs: 180_000,
  bug: {
    issue: "T6310",
    status: "fixed",
    sourceCommits: ["c2308148f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-localized-refusal",
    code: "ORD-2002",
    baseLanguage: "en",
    otherLanguage: "zh",
  },
});
