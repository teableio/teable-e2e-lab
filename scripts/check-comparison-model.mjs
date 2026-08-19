import assert from "node:assert/strict";
import {
  buildComparison,
  renderComparisonMarkdown,
  VERDICT_CELLS,
} from "./comparison-model.mjs";

const sha = (seed) => seed.repeat(40).slice(0, 40);
const short = (seed) => sha(seed).slice(0, 10);
const COMMITS = [
  {
    name: "c1",
    position: 1,
    ref: "old",
    sha: sha("a"),
    short: short("a"),
    gating: false,
  },
  {
    name: "c2",
    position: 2,
    ref: "mid",
    sha: sha("b"),
    short: short("b"),
    gating: false,
  },
  {
    name: "c3",
    position: 3,
    ref: "new",
    sha: sha("c"),
    short: short("c"),
    gating: true,
  },
];
const CATALOG = [
  { id: "record/x", issue: "T1", status: "fixed" },
  { id: "record/y", issue: "T2", status: "open" },
];

const payload = (caseId, commitSha, observed, verdict) => ({
  caseId,
  commitSha,
  observed,
  verdict,
});

// The core reading: a fixed bug present on the two older commits and absent on
// the gating one is a HEALTHY row — the ❌ cells are the world before the fix,
// the transition names where the fix landed, and nothing fails. An open bug
// absent on newer commits raises the unexpectedly-fixed notice from the gating
// column only.
{
  const comparison = buildComparison({
    caseCatalog: CATALOG,
    executePlan: COMMITS,
    payloads: [
      payload("record/x", sha("a"), "present", "regression"),
      payload("record/x", sha("b"), "present", "regression"),
      payload("record/x", sha("c"), "absent", "pass"),
      payload("record/y", sha("a"), "present", "expected-fail"),
      payload("record/y", sha("b"), "absent", "unexpected-pass"),
      payload("record/y", sha("c"), "absent", "unexpected-pass"),
    ],
  });

  assert.equal(comparison.passed, true);
  assert.equal(comparison.failures.regressions.length, 0);

  const rowX = comparison.rows[0];
  assert.deepEqual(
    rowX.transitions.map(({ kind }) => kind),
    ["fixed-between"],
  );
  assert.equal(rowX.transitions[0].toShort, short("c"));

  assert.deepEqual(comparison.notices.unexpectedlyFixed, [
    { caseId: "record/y", issue: "T2", sha: sha("c") },
  ]);

  const markdown = renderComparisonMarkdown(comparison);
  assert.match(markdown, /fixed between/);
  assert.match(markdown, /Unexpectedly fixed/);
}

// A regression IS a failure when it sits on the gating column.
{
  const comparison = buildComparison({
    caseCatalog: [CATALOG[0]],
    executePlan: COMMITS,
    payloads: [
      payload("record/x", sha("a"), "absent", "pass"),
      payload("record/x", sha("b"), "absent", "pass"),
      payload("record/x", sha("c"), "present", "regression"),
    ],
  });
  assert.equal(comparison.passed, false);
  assert.equal(comparison.failures.regressions.length, 1);
  assert.deepEqual(
    comparison.rows[0].transitions.map(({ kind }) => kind),
    ["regressed-between"],
  );
}

// An error fails on ANY column — it produced no observation.
{
  const comparison = buildComparison({
    caseCatalog: [CATALOG[0]],
    executePlan: COMMITS,
    payloads: [
      payload("record/x", sha("a"), "error", "error"),
      payload("record/x", sha("b"), "absent", "pass"),
      payload("record/x", sha("c"), "absent", "pass"),
    ],
  });
  assert.equal(comparison.passed, false);
  assert.equal(comparison.failures.errors.length, 1);
}

// Fail-closed: a missing cell and a duplicate are failures; an all-covered
// grid with no gating regressions and no errors passes.
{
  const complete = [
    payload("record/x", sha("a"), "absent", "pass"),
    payload("record/x", sha("b"), "absent", "pass"),
    payload("record/x", sha("c"), "absent", "pass"),
    payload("record/y", sha("a"), "present", "expected-fail"),
    payload("record/y", sha("b"), "present", "expected-fail"),
    payload("record/y", sha("c"), "present", "expected-fail"),
  ];
  const green = buildComparison({
    caseCatalog: CATALOG,
    executePlan: COMMITS,
    payloads: complete,
  });
  assert.equal(green.passed, true);

  const missing = buildComparison({
    caseCatalog: CATALOG,
    executePlan: COMMITS,
    payloads: complete.slice(1),
  });
  assert.equal(missing.passed, false);
  assert.equal(missing.failures.missing.length, 1);
  assert.match(renderComparisonMarkdown(missing), /Missing results/);

  const duplicated = buildComparison({
    caseCatalog: CATALOG,
    executePlan: COMMITS,
    payloads: [...complete, complete[0]],
  });
  assert.equal(duplicated.failures.duplicates.length, 1);
  assert.equal(duplicated.passed, false);
}

// A payload for a commit or case outside the plan is a failure, not silently
// dropped; an unknown verdict string is a failure, not a blank cell.
{
  const comparison = buildComparison({
    caseCatalog: CATALOG,
    executePlan: [{ ...COMMITS[0], gating: true }],
    payloads: [
      payload("record/x", sha("a"), "absent", "pass"),
      payload("record/y", sha("a"), "absent", "brand-new-verdict"),
      payload("record/x", sha("z"), "absent", "pass"),
      payload("record/unknown", sha("a"), "absent", "pass"),
    ],
  });
  assert.equal(comparison.failures.unknownVerdicts.length, 1);
  assert.equal(comparison.failures.unplanned.length, 2);
  // The unknown-verdict cell also counts as missing — nothing valid landed.
  assert.equal(comparison.failures.missing.length, 1);
  assert.equal(comparison.passed, false);
}

// A transition is never claimed across an errored or missing cell.
{
  const comparison = buildComparison({
    caseCatalog: [CATALOG[0]],
    executePlan: COMMITS,
    payloads: [
      payload("record/x", sha("a"), "present", "regression"),
      payload("record/x", sha("b"), "error", "error"),
      payload("record/x", sha("c"), "absent", "pass"),
    ],
  });
  assert.deepEqual(comparison.rows[0].transitions, []);
}

// The cell map must cover every verdict the runtime can produce.
assert.deepEqual(
  Object.keys(VERDICT_CELLS).sort(),
  ["error", "expected-fail", "pass", "regression", "unexpected-pass"].sort(),
);

console.log("comparison model ok");
