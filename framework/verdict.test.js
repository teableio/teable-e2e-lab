import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveVerdict, verdictFailsCi } from "./verdict.ts";

// The whole judgment table, spelled out with both gating positions. If this
// file and the table in verdict.ts ever disagree, this file wins in CI.
//
// The gating distinction exists for one reason: a multi-commit comparison runs
// fixed-status cases on revisions OLDER than their fix, where "present" is
// history. Only the gating column turns a regression red; an error is red
// everywhere because it produced no observation at all.
const TABLE = [
  // observed, status, verdict, failsWhenGating, failsWhenNotGating
  ["absent", "fixed", "pass", false, false],
  ["absent", "open", "unexpected-pass", false, false],
  ["present", "fixed", "regression", true, false],
  ["present", "open", "expected-fail", false, false],
  ["error", "fixed", "error", true, true],
  ["error", "open", "error", true, true],
];

test("verdict table", () => {
  for (const [
    observed,
    status,
    verdict,
    gatingFails,
    historicalFails,
  ] of TABLE) {
    assert.equal(
      resolveVerdict(observed, status),
      verdict,
      `resolveVerdict(${observed}, ${status})`,
    );
    assert.equal(
      verdictFailsCi(verdict, { gating: true }),
      gatingFails,
      `verdictFailsCi(${verdict}, gating)`,
    );
    assert.equal(
      verdictFailsCi(verdict, { gating: false }),
      historicalFails,
      `verdictFailsCi(${verdict}, historical)`,
    );
  }
});
