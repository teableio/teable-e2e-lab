// Concludes the teable-ee check run that teable-ee's develop-push trigger
// (teable-e2e-lab-trigger.yml) opened on the pushed commit before dispatching
// this run — the same Checks API shape teable-enterprise's remote suites use,
// authenticated as the same teable-remote-ci App.
//
// The verdict is the report job's own acceptance step, not a re-derivation:
// acceptance is the one fail-closed judgment in this repository, and a check
// run that could disagree with it would be a second source of truth. The
// summary is renderComparisonMarkdown over the same comparison.json — again
// one implementation, not two. The run itself is public, so the check run
// links to it for full logs and artifacts instead of copying logs across.

import { readFile } from "node:fs/promises";
import { renderComparisonMarkdown } from "./comparison-model.mjs";
import { env, requiredEnv } from "./env.mjs";

const TEABLE_EE = "teableio/teable-ee";

// GitHub rejects check-run output.summary beyond 65535 characters. The table
// is small in practice; the cap only guards a pathological error message.
const SUMMARY_LIMIT = 60000;

export const buildCheckRunConclusion = ({
  comparison,
  acceptanceOutcome,
  jobStatus,
  runUrl,
}) => {
  const conclusion =
    jobStatus === "cancelled" || acceptanceOutcome === "cancelled"
      ? "cancelled"
      : acceptanceOutcome === "success"
        ? "success"
        : "failure";

  const sections = [];
  if (comparison) {
    sections.push(renderComparisonMarkdown(comparison).trimEnd());
    if (conclusion === "failure" && comparison.passed) {
      // The one way the table and the verdict can point apart: acceptance
      // never ran (or the job broke after it) over a comparison that passed.
      sections.push(
        "The comparison itself passed — the report job failed somewhere else. The run log has the failing step.",
      );
    }
  } else {
    sections.push(
      "The run broke before the comparison was built — there is no bug × commit table for this run. The run log has the failing step.",
    );
  }
  sections.push(`Run (public logs and artifacts): ${runUrl}`);

  let summary = sections.join("\n\n");
  if (summary.length > SUMMARY_LIMIT) {
    summary = `${summary.slice(0, SUMMARY_LIMIT)}\n\n_Truncated — the full table is in the run's job summary._`;
  }

  return {
    conclusion,
    title: `bug regression: ${conclusion}`,
    summary,
  };
};

const main = async () => {
  const checkRunId = requiredEnv("TEABLE_EE_CHECK_RUN_ID");
  const token = requiredEnv("TEABLE_EE_CHECKS_TOKEN");
  const repository = env("GITHUB_REPOSITORY", "teableio/teable-e2e-lab");
  const runUrl = `https://github.com/${repository}/actions/runs/${env("GITHUB_RUN_ID", "")}`;

  // Absent when anything before build-comparison broke; the conclusion must
  // still land, or the check run spins until the watchdog reaps it.
  let comparison = null;
  try {
    comparison = JSON.parse(
      await readFile(requiredEnv("E2E_LAB_COMPARISON_PATH"), "utf8"),
    );
  } catch {
    comparison = null;
  }

  const { conclusion, title, summary } = buildCheckRunConclusion({
    comparison,
    acceptanceOutcome: env("E2E_LAB_ACCEPTANCE_OUTCOME", "skipped"),
    jobStatus: env("E2E_LAB_JOB_STATUS", ""),
    runUrl,
  });

  const apiUrl = env("GITHUB_API_URL", "https://api.github.com");
  const res = await fetch(
    `${apiUrl}/repos/${TEABLE_EE}/check-runs/${checkRunId}`,
    {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({
        status: "completed",
        conclusion,
        details_url: runUrl,
        output: { title, summary },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(
      `Concluding check run ${checkRunId} failed: HTTP ${res.status}, body ${(await res.text()).slice(0, 300)}`,
    );
  }
  console.log(`Check run ${checkRunId} concluded: ${conclusion}`);
};

const invokedDirectly = process.argv[1]
  ? import.meta.url.endsWith(process.argv[1].split("/").pop())
  : false;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
