import assert from "node:assert/strict";
import { MAX_COMMITS, resolveRunPlan, shortSha } from "./run-plan-model.mjs";

const sha = (seed) => seed.repeat(40).slice(0, 40);
const ALL_CASES = [
  "smoke/y153-auth-user",
  "record/y154-bulk-update-100-mixed-lands",
];

// Happy path: two commits, all cases.
{
  const plan = resolveRunPlan({
    resolvedCommits: [
      { ref: "develop", sha: sha("a") },
      { ref: "release.1", sha: sha("b") },
    ],
    caseFilter: "all",
    allCaseIds: ALL_CASES,
  });
  assert.equal(plan.executePlan.length, 2);
  assert.equal(plan.executePlan[0].name, `c1-${shortSha(sha("a"))}`);
  assert.equal(plan.executePlan[1].position, 2);
  // Only the last commit gates — earlier columns are history.
  assert.deepEqual(
    plan.executePlan.map(({ gating }) => gating),
    [false, true],
  );
  assert.deepEqual(plan.caseIds, ALL_CASES);
  assert.equal(plan.planSummary.expectedPayloads, 4);
}

// Column order is dispatch order, verbatim.
{
  const plan = resolveRunPlan({
    resolvedCommits: [
      { ref: "newer", sha: sha("b") },
      { ref: "older", sha: sha("a") },
    ],
    caseFilter: "smoke/y153-auth-user",
    allCaseIds: ALL_CASES,
  });
  assert.deepEqual(
    plan.executePlan.map(({ ref }) => ref),
    ["newer", "older"],
  );
  assert.deepEqual(plan.caseIds, ["smoke/y153-auth-user"]);
}

// Refusals, each with the reason a dispatcher will actually hit.
assert.throws(
  () =>
    resolveRunPlan({
      resolvedCommits: [],
      caseFilter: "all",
      allCaseIds: ALL_CASES,
    }),
  /At least one/,
);
assert.throws(
  () =>
    resolveRunPlan({
      resolvedCommits: Array.from({ length: MAX_COMMITS + 1 }, (_, index) => ({
        ref: `r${index}`,
        sha: sha(String(index % 10)),
      })),
      caseFilter: "all",
      allCaseIds: ALL_CASES,
    }),
  /cap is/,
);
assert.throws(
  () =>
    resolveRunPlan({
      resolvedCommits: [{ ref: "develop", sha: "abc123" }],
      caseFilter: "all",
      allCaseIds: ALL_CASES,
    }),
  /40-character/,
);
assert.throws(
  () =>
    resolveRunPlan({
      resolvedCommits: [
        { ref: "develop", sha: sha("a") },
        { ref: "also-develop", sha: sha("a") },
      ],
      caseFilter: "all",
      allCaseIds: ALL_CASES,
    }),
  /same commit/,
);
assert.throws(
  () =>
    resolveRunPlan({
      resolvedCommits: [{ ref: "develop", sha: sha("a") }],
      caseFilter: "no/such-case",
      allCaseIds: ALL_CASES,
    }),
  /Unknown case id/,
);

console.log("run-plan model ok");
