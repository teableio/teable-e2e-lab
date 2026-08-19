// The fail-closed gate, and the only step that turns the report job red.
//
// It reads the comparison the previous step wrote (one implementation of the
// rules, not two) and fails on: missing payloads, duplicate payloads,
// unplanned payloads, unknown verdicts, regressions, and errored cases.
// Expected-fails and unexpected-passes never fail — see framework/verdict.ts
// for the argument.

import { appendFile, readFile } from "node:fs/promises";
import { requiredEnv } from "./env.mjs";

const comparison = JSON.parse(
  await readFile(requiredEnv("E2E_LAB_COMPARISON_PATH"), "utf8"),
);

const reasons = Object.entries(comparison.failures)
  .filter(([, list]) => list.length > 0)
  .map(([code, list]) => `${code}:${list.length}`);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `status=${comparison.passed ? "success" : "failure"}`,
      `reason_codes=${reasons.join(",")}`,
      "",
    ].join("\n"),
  );
}

if (!comparison.passed) {
  console.error(`Run acceptance failed: ${reasons.join(", ")}`);
  for (const [code, list] of Object.entries(comparison.failures)) {
    for (const failure of list) {
      console.error(
        `- ${code}: ${failure.caseId ?? "?"} @ ${(failure.sha ?? "?").slice(0, 10)}`,
      );
    }
  }
  process.exit(1);
}

console.log(
  "Run acceptance passed: every planned cell has exactly one payload, no regressions, no errors.",
);
