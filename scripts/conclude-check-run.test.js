import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckRunConclusion } from "./conclude-check-run.mjs";

const RUN_URL = "https://github.com/teableio/teable-e2e-lab/actions/runs/1";

const comparison = ({ passed = true } = {}) => ({
  commits: [{ ref: "develop", sha: "a".repeat(40), short: "aaaaaaaaaa" }],
  rows: [
    {
      caseId: "record/case",
      issue: "T1",
      status: "fixed",
      cells: [
        {
          sha: "a".repeat(40),
          short: "aaaaaaaaaa",
          verdict: passed ? "pass" : "regression",
          observed: passed ? "absent" : "present",
        },
      ],
      transitions: [],
    },
  ],
  failures: {
    missing: [],
    duplicates: [],
    unplanned: [],
    unknownVerdicts: [],
    regressions: passed ? [] : [{ caseId: "record/case", sha: "a".repeat(40) }],
    errors: [],
  },
  notices: { unexpectedlyFixed: [] },
  passed,
});

test("acceptance success concludes success and carries the table and run link", () => {
  const { conclusion, title, summary } = buildCheckRunConclusion({
    comparison: comparison(),
    acceptanceOutcome: "success",
    jobStatus: "success",
    runUrl: RUN_URL,
  });

  assert.equal(conclusion, "success");
  assert.equal(title, "bug regression: success");
  assert.match(summary, /Bug × commit/);
  assert.match(summary, /record\/case/);
  assert.ok(summary.includes(RUN_URL));
});

test("anything but acceptance success concludes failure", () => {
  for (const acceptanceOutcome of ["failure", "skipped"]) {
    const { conclusion } = buildCheckRunConclusion({
      comparison: comparison({ passed: false }),
      acceptanceOutcome,
      jobStatus: "success",
      runUrl: RUN_URL,
    });
    assert.equal(conclusion, "failure");
  }
});

test("a cancelled job concludes cancelled, not failure", () => {
  const { conclusion } = buildCheckRunConclusion({
    comparison: null,
    acceptanceOutcome: "skipped",
    jobStatus: "cancelled",
    runUrl: RUN_URL,
  });
  assert.equal(conclusion, "cancelled");
});

test("a missing comparison still produces a conclusion that says what is absent", () => {
  const { conclusion, summary } = buildCheckRunConclusion({
    comparison: null,
    acceptanceOutcome: "skipped",
    jobStatus: "success",
    runUrl: RUN_URL,
  });

  assert.equal(conclusion, "failure");
  assert.match(summary, /before the comparison was built/);
  assert.ok(summary.includes(RUN_URL));
});

test("a failure over a passed comparison names the disagreement", () => {
  const { summary } = buildCheckRunConclusion({
    comparison: comparison(),
    acceptanceOutcome: "skipped",
    jobStatus: "success",
    runUrl: RUN_URL,
  });

  assert.match(summary, /report job failed somewhere else/);
});

test("an oversized summary is truncated below the Checks API cap", () => {
  const big = comparison();
  big.rows = Array.from({ length: 3000 }, (_, index) => ({
    ...big.rows[0],
    caseId: `record/case-${index}-${"x".repeat(40)}`,
  }));

  const { summary } = buildCheckRunConclusion({
    comparison: big,
    acceptanceOutcome: "success",
    jobStatus: "success",
    runUrl: RUN_URL,
  });

  assert.ok(summary.length < 65535);
  assert.match(summary, /Truncated/);
});
