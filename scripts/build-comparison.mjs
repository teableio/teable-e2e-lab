// Report-job entry: collect every payload the execute jobs uploaded, build the
// bug x commit comparison, write comparison.json for the acceptance gate, and
// append the table to the GitHub summary.
//
// Payloads are grouped by their own commitSha field, never by artifact
// directory names — the directory layout is a transport detail.

import { appendFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCaseCatalog, resolveCaseFilter } from "./case-catalog.mjs";
import {
  buildComparison,
  renderComparisonMarkdown,
} from "./comparison-model.mjs";
import { requiredEnv } from "./env.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const paths = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walk(path)));
    } else {
      paths.push(path);
    }
  }
  return paths;
};

const isPayload = (value) =>
  value &&
  typeof value === "object" &&
  typeof value.caseId === "string" &&
  typeof value.commitSha === "string" &&
  typeof value.verdict === "string";

const collectPayloads = async (artifactDir) => {
  const payloads = [];
  for (const path of await walk(artifactDir)) {
    if (!path.endsWith(".json")) {
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch {
      // Not a payload; other JSON files may travel in the same artifacts.
      continue;
    }
    if (isPayload(parsed)) {
      payloads.push(parsed);
    }
  }
  return payloads;
};

const main = async () => {
  const artifactDir = requiredEnv("E2E_LAB_ARTIFACT_DIR");
  const executePlan = JSON.parse(requiredEnv("E2E_LAB_EXECUTE_PLAN"));
  const caseFilter = process.env.E2E_LAB_CASE_FILTER ?? "all";
  const outputPath = requiredEnv("E2E_LAB_COMPARISON_PATH");

  const catalog = await loadCaseCatalog(repoRoot);
  const plannedIds = new Set(
    resolveCaseFilter(
      caseFilter,
      catalog.map(({ id }) => id),
    ),
  );
  const plannedCatalog = catalog.filter(({ id }) => plannedIds.has(id));

  const payloads = await collectPayloads(artifactDir);
  const comparison = buildComparison({
    caseCatalog: plannedCatalog,
    executePlan,
    payloads,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(comparison, null, 2)}\n`);

  const markdown = renderComparisonMarkdown(comparison);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  } else {
    console.log(markdown);
  }
  console.log(
    `Comparison built: ${comparison.rows.length} cases x ${comparison.commits.length} commits, passed=${comparison.passed}`,
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
