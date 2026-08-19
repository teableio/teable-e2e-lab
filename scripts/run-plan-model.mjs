// Pure planning model: resolved commits + case filter -> the execute matrix
// and the coverage contract the report job will verify against. Kept free of
// filesystem and GitHub concerns so check-run-plan.mjs can exercise every
// branch.

import { resolveCaseFilter } from "./case-catalog.mjs";

// One job per commit, and every commit pays a full bootstrap (install, prisma
// generate, migrate, seed). The bound is a runner-pool courtesy, not a design
// limit — raise it deliberately, not by deleting the check.
export const MAX_COMMITS = 8;

const SHA_PATTERN = /^[0-9a-f]{40}$/;

export const shortSha = (sha) => sha.slice(0, 10);

export const resolveRunPlan = ({ resolvedCommits, caseFilter, allCaseIds }) => {
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
  const executePlan = resolvedCommits.map((commit, index) => ({
    name: `c${index + 1}-${shortSha(commit.sha)}`,
    position: index + 1,
    ref: commit.ref,
    sha: commit.sha,
    short: shortSha(commit.sha),
    artifactSuffix: shortSha(commit.sha),
    gating: index === resolvedCommits.length - 1,
  }));

  return {
    executePlan,
    caseIds,
    planSummary: {
      commitCount: executePlan.length,
      caseCount: caseIds.length,
      expectedPayloads: executePlan.length * caseIds.length,
      commits: executePlan.map(({ ref, short, gating }) => ({
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
    `- Cases: ${planSummary.caseCount}`,
    `- Expected payloads: ${planSummary.expectedPayloads}`,
    "",
  ].join("\n");
