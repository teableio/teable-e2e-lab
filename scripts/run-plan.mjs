// Turns the dispatch inputs into the execute matrix and the coverage contract.
// Reads:
//   E2E_LAB_RESOLVED_COMMITS  JSON [{ref, sha}] — the workflow resolves refs to
//                             SHAs with git before calling this, so the plan
//                             only ever contains pinned revisions.
//   E2E_LAB_CASE_FILTER       case id, comma-separated ids, or "all".
// Writes GitHub outputs: execute_plan (the commit x engine job matrix),
// commit_plan (each commit once — the comparison reads columns, not jobs),
// case_ids, plan_summary.

import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCaseCatalog } from "./case-catalog.mjs";
import {
  renderPlanSummaryMarkdown,
  resolveRunPlan,
} from "./run-plan-model.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const main = async () => {
  const catalog = await loadCaseCatalog(repoRoot);
  const plan = resolveRunPlan({
    resolvedCommits: JSON.parse(process.env.E2E_LAB_RESOLVED_COMMITS ?? "[]"),
    caseFilter: process.env.E2E_LAB_CASE_FILTER ?? "all",
    allCaseIds: catalog.map(({ id }) => id),
    skipV1CaseIds: catalog.filter(({ skipV1 }) => skipV1).map(({ id }) => id),
  });

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `execute_plan=${JSON.stringify(plan.executePlan)}`,
        `commit_plan=${JSON.stringify(plan.commitPlan)}`,
        `case_ids=${JSON.stringify(plan.caseIds)}`,
        `plan_summary=${JSON.stringify(plan.planSummary)}`,
        "",
      ].join("\n"),
    );
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        renderPlanSummaryMarkdown(plan.planSummary),
      );
    }
  } else {
    console.log(JSON.stringify(plan, null, 2));
  }

  console.log(`Resolved plan: ${JSON.stringify(plan.planSummary)}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
