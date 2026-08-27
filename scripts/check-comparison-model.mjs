import assert from "node:assert/strict";
import {
  buildComparison,
  renderComparisonMarkdown,
  renderReferenceMarkdown,
  SKIPPED_CELL,
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

// A full run against one commit is read as "did anything break": the counts go
// on top and the per-case table folds away. A multi-commit run keeps it open,
// because the columns beside each other are the whole point.
{
  const develop = [
    {
      name: "c1",
      position: 1,
      ref: "develop",
      sha: sha("d"),
      short: short("d"),
      gating: true,
    },
  ];
  const comparison = buildComparison({
    caseCatalog: CATALOG,
    executePlan: develop,
    payloads: [
      payload("record/x", sha("d"), "absent", "pass"),
      payload("record/y", sha("d"), "present", "regression"),
    ],
  });
  const markdown = renderComparisonMarkdown(comparison);
  assert.match(markdown, /\*\*2 cases\*\* ran on/);
  assert.match(markdown, /\*\*1 passed\*\*, \*\*1 failed\*\*/);
  assert.match(markdown, /<details>/);
  assert.match(markdown, /<summary>Per-case results \(2\)<\/summary>/);
  // The rows are still there, folded rather than dropped.
  assert.match(markdown, /record\/x/);
  assert.match(markdown, /record\/y/);
  // And the actionable part stays outside the fold.
  assert.match(markdown, /### ❌ Regressions/);

  const multi = buildComparison({
    caseCatalog: [CATALOG[0]],
    executePlan: COMMITS,
    payloads: [
      payload("record/x", sha("a"), "present", "expected-fail"),
      payload("record/x", sha("b"), "present", "expected-fail"),
      payload("record/x", sha("c"), "absent", "pass"),
    ],
  });
  assert.doesNotMatch(renderComparisonMarkdown(multi), /<details>/);
}

// A case that is declared open and behaves as declared counts as passed - the
// question the single-column run answers is whether anything broke, and a
// known-unfixed bug reproducing is not something breaking.
{
  const develop = [
    {
      name: "c1",
      position: 1,
      ref: "develop",
      sha: sha("e"),
      short: short("e"),
      gating: true,
    },
  ];
  const comparison = buildComparison({
    caseCatalog: [CATALOG[1]],
    executePlan: develop,
    payloads: [payload("record/y", sha("e"), "present", "expected-fail")],
  });
  assert.match(
    renderComparisonMarkdown(comparison),
    /\*\*1 case\*\* ran on .* \*\*1 passed\*\*, \*\*0 failed\*\*/,
  );
}

// The v1 reference column. Everything below is the same run seen twice: the
// guarded table must read exactly as it did before v1 existed, and the v1
// table must never be able to reach into it.
{
  const develop = [
    {
      name: "c1",
      position: 1,
      ref: "develop",
      sha: sha("f"),
      short: short("f"),
      gating: true,
    },
  ];
  const catalog = [
    { id: "record/x", issue: "T1", status: "fixed" },
    {
      id: "record/skipped",
      issue: "T2",
      status: "fixed",
      skipV1: "v1 has no such column",
    },
  ];
  const v1 = (caseId, observed, verdict) => ({
    ...payload(caseId, sha("f"), observed, verdict),
    engine: "v1",
  });
  const v2 = (caseId, observed, verdict) => ({
    ...payload(caseId, sha("f"), observed, verdict),
    engine: "v2",
  });

  const comparison = buildComparison({
    caseCatalog: catalog,
    executePlan: develop,
    engines: ["v1", "v2"],
    payloads: [
      v2("record/x", "absent", "pass"),
      v2("record/skipped", "absent", "pass"),
      // The two verdicts that turn the guarded column red, on the reference
      // engine. Neither may be allowed anywhere near `passed`.
      v1("record/x", "present", "regression"),
    ],
  });

  assert.equal(comparison.passed, true);
  assert.deepEqual(comparison.failures.regressions, []);
  assert.deepEqual(comparison.failures.errors, []);
  assert.deepEqual(comparison.failures.missing, []);

  const [row, skippedRow] = comparison.rows;
  assert.equal(row.cells[0].verdict, "pass");
  assert.equal(row.referenceCells[0].verdict, "regression");
  // A declared skip is not a hole: it never asks for a payload and never
  // reports one missing.
  assert.equal(skippedRow.referenceCells[0].skipped, true);
  assert.equal(
    comparison.referenceIssues.filter(
      (issue) => issue.caseId === "record/skipped",
    ).length,
    0,
  );

  const reference = renderReferenceMarkdown(comparison);
  assert.match(reference, /## v1 reference/);
  assert.ok(reference.includes(SKIPPED_CELL));
  assert.match(reference, /v1 has no such column/);
  // The guarded table says nothing about v1.
  assert.doesNotMatch(renderComparisonMarkdown(comparison), /v1 reference/);
}

// A v1 payload for a case that declared skipV1 is unplanned — but on the
// reference side, so it is reported and still does not fail the run.
{
  const develop = [
    {
      name: "c1",
      position: 1,
      ref: "develop",
      sha: sha("f"),
      short: short("f"),
      gating: true,
    },
  ];
  const comparison = buildComparison({
    caseCatalog: [
      { id: "record/skipped", issue: "T2", status: "fixed", skipV1: "no" },
    ],
    executePlan: develop,
    engines: ["v1", "v2"],
    payloads: [
      {
        ...payload("record/skipped", sha("f"), "absent", "pass"),
        engine: "v2",
      },
      {
        ...payload("record/skipped", sha("f"), "absent", "pass"),
        engine: "v1",
      },
    ],
  });
  assert.equal(comparison.passed, true);
  assert.deepEqual(comparison.failures.unplanned, []);
  assert.equal(
    comparison.referenceIssues.some((issue) => issue.kind === "unplanned"),
    true,
  );
}

// A payload written before the engine existed reads as v2, so an older
// artifact still lands in the guarded table rather than vanishing.
{
  const develop = [
    {
      name: "c1",
      position: 1,
      ref: "develop",
      sha: sha("f"),
      short: short("f"),
      gating: true,
    },
  ];
  const comparison = buildComparison({
    caseCatalog: [{ id: "record/x", issue: "T1", status: "fixed" }],
    executePlan: develop,
    engines: ["v2"],
    payloads: [payload("record/x", sha("f"), "absent", "pass")],
  });
  assert.equal(comparison.rows[0].cells[0].verdict, "pass");
  assert.equal(renderReferenceMarkdown(comparison), "");
}
