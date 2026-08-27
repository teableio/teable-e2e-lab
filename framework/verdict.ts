// The judgment core of the whole system, kept as a pure function so it can be
// tested without a Nest app (framework/verdict.test.js) and read in one screen.
//
// A bug case does not pass or fail — it OBSERVES, and the verdict labels the
// observation against the declared expectation:
//
//                      | bug.status: fixed | bug.status: open
//   observed: absent   | pass              | unexpected-pass
//   observed: present  | regression        | expected-fail
//   observed: error    | error             | error
//
// The verdict is a LABEL; whether it fails anything also depends on WHERE it
// was observed. A multi-commit comparison deliberately runs fixed-status cases
// on revisions older than their fix, where "present" is history, not a
// regression — so only the gating revision (the newest column of a comparison,
// or the single revision of a targeted run) turns a regression red. An `error`
// fails everywhere: the case never reached its checkpoint, produced no
// observation, and counting it as anything else would let a broken harness
// impersonate a stable bug forever.

export type ObservedOutcome = "absent" | "present" | "error";
export type BugStatus = "open" | "fixed";
export type BugVerdict =
  | "pass"
  | "expected-fail"
  | "unexpected-pass"
  | "regression"
  | "error";

export const resolveVerdict = (
  observed: ObservedOutcome,
  status: BugStatus,
): BugVerdict => {
  if (observed === "error") {
    return "error";
  }
  if (observed === "present") {
    return status === "fixed" ? "regression" : "expected-fail";
  }
  return status === "fixed" ? "pass" : "unexpected-pass";
};

// Which verdicts turn the run red. Deliberately NOT "anything that is not a
// pass": an expected-fail is the system working as designed, and an
// unexpected-pass is good news that a human must confirm — failing the run for
// good news teaches people to mark bugs "fixed" without verifying, which is
// how the metadata rots.
export const verdictFailsCi = (
  verdict: BugVerdict,
  { gating, engine }: { gating: boolean; engine?: string },
): boolean => {
  // v1 is a REFERENCE column and never fails anything.
  //
  // The lab guards v2: that is where the fixes land and where a returning bug
  // is a regression someone must act on. v1 is run to answer a different
  // question — "what does the engine our older customers are still on do with
  // this?" — and its answer is information, not a contract. A v1 cell that
  // reproduces is usually just the world without the fix, and a v1 cell that
  // errors usually means the case leans on something v1 shapes differently.
  // Failing the run for either would make every v1 observation a chore, and
  // the column would be switched off within a month.
  if (engine === "v1") {
    return false;
  }
  return verdict === "error" || (verdict === "regression" && gating);
};
