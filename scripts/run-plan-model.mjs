// Pure planning model: resolved commits + case filter -> the execute matrix
// and the coverage contract the report job will verify against. Kept free of
// filesystem and GitHub concerns so check-run-plan.mjs can exercise every
// branch.

import { resolveCaseFilter } from "./case-catalog.mjs";

// One job per commit PER ENGINE, and every job pays a full bootstrap (install,
// prisma generate, migrate, seed). So the cap below is jobs/2, not jobs. The
// bound is a runner-pool courtesy, not a design limit — raise it deliberately,
// not by deleting the check.
export const MAX_COMMITS = 8;

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const shortSha = (sha) => sha.slice(0, 10);

export const resolveRunPlan = ({
  resolvedCommits,
  caseFilter,
  allCaseIds,
  // Cases that declare skipV1, so the coverage contract does not expect a v1
  // payload for them. The engine list is not a dispatch input: both engines
  // always run, and which cases v1 can be asked is a property of the cases.
  skipV1CaseIds = [],
  engines = ["v1", "v2"],
}) => {
  if (!Array.isArray(resolvedCommits) || resolvedCommits.length === 0) {
    throw new Error("At least one teable-ee commit is required.");
  }
  if (resolvedCommits.length > MAX_COMMITS) {
    throw new Error(
      `${resolvedCommits.length} commits requested; the cap is ${MAX_COMMITS} per dispatch.`,
    );
  }

  const seen = new Map();
  for (const commit of resolvedCommits) {
    if (!commit || typeof commit.sha !== "string" || !commit.ref) {
      throw new Error(
        `Malformed resolved commit entry: ${JSON.stringify(commit)}`,
      );
    }
    if (!SHA_PATTERN.test(commit.sha)) {
      throw new Error(
        `"${commit.ref}" did not resolve to a full 40-character SHA (got "${commit.sha}").`,
      );
    }
    // Two refs resolving to one SHA would give the table two identical columns
    // and the acceptance gate two artifacts for one logical column. Refuse
    // rather than dedupe silently: the dispatcher meant something by the list.
    if (seen.has(commit.sha)) {
      throw new Error(
        `"${commit.ref}" and "${seen.get(commit.sha)}" resolve to the same commit ${commit.sha}.`,
      );
    }
    seen.set(commit.sha, commit.ref);
  }

  const caseIds = resolveCaseFilter(caseFilter, allCaseIds);

  // Column order is dispatch order. The table reads left-to-right as
  // older-to-newer only if the dispatcher passes commits that way — the
  // planner does not consult the git graph (that is a possible later
  // refinement, and doing it here would need a clone this script does not
  // have).
  // Only the LAST commit gates: it is the "current" revision whose bug.status
  // declarations are enforced. Earlier columns are history — a fixed bug
  // reproducing there is the world before the fix, not a regression. Errors
  // fail on every column regardless (framework/verdict.ts).
  const commitPlan = resolvedCommits.map((commit, index) => ({
    name: `c${index + 1}-${shortSha(commit.sha)}`,
    position: index + 1,
    ref: commit.ref,
    sha: commit.sha,
    short: shortSha(commit.sha),
    artifactSuffix: shortSha(commit.sha),
    gating: index === resolvedCommits.length - 1,
  }));

  // The execute matrix is commit x engine, one job each.
  //
  // Sharing a job was cheaper by one bootstrap and wrong in a way that only
  // showed up on reflection: two passes against ONE database means the second
  // engine runs on state the first one left, and the guarded column is the one
  // that would have been reading it. Separate jobs give each engine its own
  // containers and its own database built from the commit's own migrations —
  // the arrangement teable-perf-lab has run both engines on for a year — and
  // they run at the same time, so the wall clock is one engine's, not two.
  //
  // `gating` stays a property of the COMMIT: whether a reproduction there is a
  // regression is about which revision it is, and whether it can fail anything
  // at all is about the engine (framework/verdict.ts).
  const executePlan = commitPlan.flatMap((commit) =>
    engines.map((engine) => ({
      ...commit,
      name: `${commit.name}-${engine}`,
      engine,
      artifactSuffix: `${commit.artifactSuffix}-${engine}`,
    })),
  );

  const skipped = new Set(skipV1CaseIds);
  const v1CaseCount = engines.includes("v1")
    ? caseIds.filter((id) => !skipped.has(id)).length
    : 0;
  const v2CaseCount = engines.includes("v2") ? caseIds.length : 0;

  return {
    executePlan,
    // The comparison reads columns, not jobs: it must see each commit once.
    commitPlan,
    caseIds,
    engines,
    planSummary: {
      commitCount: commitPlan.length,
      caseCount: caseIds.length,
      engines,
      v1CaseCount,
      // Only the v2 half is a contract the acceptance gate enforces; the v1
      // half is counted so a reader can see the run got what it paid for.
      jobCount: executePlan.length,
      expectedPayloads: commitPlan.length * (v1CaseCount + v2CaseCount),
      expectedGuardedPayloads: commitPlan.length * v2CaseCount,
      commits: commitPlan.map(({ ref, short, gating }) => ({
        ref,
        short,
        gating,
      })),
    },
  };
};

export const renderPlanSummaryMarkdown = (planSummary) =>
  [
    "## Run plan",
    "",
    `- Commits: ${planSummary.commitCount} (${planSummary.commits
      .map(
        ({ ref, short, gating }) =>
          `${ref}@${short}${gating ? " ←gating" : ""}`,
      )
      .join(", ")})`,
    `- Cases: ${planSummary.caseCount} (v2), ${planSummary.v1CaseCount} of them also asked of v1`,
    `- Engines: ${(planSummary.engines ?? ["v2"]).join(", ")} — ${planSummary.jobCount} execute job(s), one per commit per engine`,
    `- Expected payloads: ${planSummary.expectedPayloads} (${planSummary.expectedGuardedPayloads} guarded)`,
    "",
  ].join("\n");
