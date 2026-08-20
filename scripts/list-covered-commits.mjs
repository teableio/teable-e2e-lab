// What the next triage pass can skip: every teable-ee commit this repository
// has already decided about, and how it was decided.
//
// Printed from the registry and the ledger rather than kept as a list, because
// a hand-maintained list of what is covered is a list that goes stale the
// first time someone is in a hurry.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCaseCatalog } from "./case-catalog.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const asJson = process.argv.includes("--json");

const catalog = await loadCaseCatalog(repoRoot);
const ledger = await readFile(join(repoRoot, "docs/triage-ledger.md"), "utf8");

const settled = catalog
  .flatMap((entry) =>
    (entry.sourceCommits ?? []).map((commit) => ({
      commit,
      disposition: "case",
      issue: entry.issue,
      detail: entry.id,
    })),
  )
  .sort((a, b) => a.commit.localeCompare(b.commit));

const skipped = [...ledger.matchAll(/^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|/gm)]
  .map(([, commit, issue, reason]) => ({
    commit: commit.trim(),
    disposition: "skipped",
    issue: issue.trim(),
    detail: reason.trim(),
  }))
  .sort((a, b) => a.commit.localeCompare(b.commit));

const decided = [...settled, ...skipped];

if (asJson) {
  console.log(JSON.stringify(decided, null, 2));
} else {
  console.log(`${decided.length} teable-ee commits already decided:\n`);
  for (const row of settled) {
    console.log(
      `  case     ${row.commit}  ${row.issue.padEnd(30)} ${row.detail}`,
    );
  }
  for (const row of skipped) {
    console.log(
      `  skipped  ${row.commit}  ${row.issue.padEnd(30)} ${row.detail.slice(0, 80)}`,
    );
  }
  console.log(
    "\nAnything not listed here has not been triaged. Skipped rows carry the reason;\n" +
      "if the reason no longer holds, delete the row in docs/triage-ledger.md and write the case.",
  );
}
