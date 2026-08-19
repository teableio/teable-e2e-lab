// Catalog consistency, fail-closed at check time so it never has to be
// discovered at run time:
//   - every cases/**/*.case.ts on disk is imported AND registered (a case that
//     is imported but missing from the array would silently vanish from every
//     run — the exact drift perf-lab's catalog module exists to prevent);
//   - every registered case has the same-name .md doc;
//   - every case id matches its path (cases/<group>/<name>.case.ts -> id
//     "<group>/<name>"), so a file move cannot silently rename an identity;
//   - ids are unique; `status` is a valid value.

import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fileExists,
  findCaseFilesOnDisk,
  getMarkdownPath,
  loadCaseCatalog,
} from "./case-catalog.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

const onDisk = await findCaseFilesOnDisk(repoRoot);
const catalog = await loadCaseCatalog(repoRoot);
const registeredPaths = new Set(catalog.map((entry) => entry.path));

for (const path of onDisk) {
  if (!registeredPaths.has(path)) {
    problems.push(
      `${path} exists on disk but is not registered in registry.ts`,
    );
  }
}

const seenIds = new Set();
for (const entry of catalog) {
  const expectedId = `${basename(dirname(entry.path))}/${basename(entry.path, ".case.ts")}`;
  if (entry.id !== expectedId) {
    problems.push(
      `${entry.path}: id "${entry.id}" does not match its path (expected "${expectedId}")`,
    );
  }
  if (seenIds.has(entry.id)) {
    problems.push(`duplicate case id: ${entry.id}`);
  }
  seenIds.add(entry.id);
  if (!["open", "fixed"].includes(entry.status)) {
    problems.push(
      `${entry.path}: bug.status "${entry.status}" is not "open" or "fixed"`,
    );
  }
  const markdownPath = getMarkdownPath(entry.path);
  if (!(await fileExists(join(repoRoot, markdownPath)))) {
    problems.push(`${entry.path}: missing case doc ${markdownPath}`);
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  console.error(`check:case-docs failed (${problems.length} problems)`);
  process.exit(1);
}

console.log(`case catalog ok (${catalog.length} cases)`);
