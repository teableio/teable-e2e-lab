// The triage contract, fail-closed at check time.
//
// Every batch of cases here starts by scanning recent teable-ee commits for
// fixes worth reproducing. That scan is only as cheap as the record of what
// has already been decided, so two things have to stay true:
//
//   - a case that reproduces a tracked bug names the commits it settles
//     (`bug.sourceCommits`), so the scan can skip them. Sentinels may omit it —
//     some guard a path rather than a commit — but when they do name commits,
//     those count the same way;
//   - a commit-and-issue pair is either settled by a case or skipped by
//     docs/triage-ledger.md, never both, and never claimed by a malformed SHA
//     that matches nothing. The pair rather than the commit, because one commit
//     can fix three issues and land on both sides: one reproduced here, two
//     rejected with reasons.
//
// Without the first rule the scan can only match issue ids, which loses every
// sentinel and mis-reads any commit carrying more than one id. Without the
// second, the ledger and the cases can disagree about the same commit and the
// scan believes whichever it reads last.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCaseCatalog } from "./case-catalog.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEDGER_PATH = "docs/triage-ledger.md";
const SHA_PATTERN = /^[0-9a-f]{7,40}$/;
const problems = [];

const catalog = await loadCaseCatalog(repoRoot);
const ledger = await readFile(join(repoRoot, LEDGER_PATH), "utf8");

// Ledger rows: | `sha` | issue | why not |. The reason column is required —
// a row that only says "skipped" tells the next pass nothing it can act on.
const ledgerRows = [
  ...ledger.matchAll(/^\|\s*`([^`]+)`\s*\|([^|]*)\|([^|]*)\|/gm),
].map(([, commit, issue, reason]) => ({
  commit: commit.trim(),
  issue: issue.trim(),
  reason: reason.trim(),
}));

if (ledgerRows.length === 0) {
  problems.push(
    `${LEDGER_PATH}: no rows parsed — the table shape changed and this check has gone blind`,
  );
}

const ledgerCommits = new Map();
for (const row of ledgerRows) {
  if (!SHA_PATTERN.test(row.commit)) {
    problems.push(
      `${LEDGER_PATH}: "${row.commit}" is not a short SHA (7-40 hex characters)`,
    );
  }
  if (row.reason.length < 20) {
    problems.push(
      `${LEDGER_PATH}: ${row.commit} has no usable reason — the next triage pass needs to know why, not just that`,
    );
  }
  if (row.issue.length === 0) {
    problems.push(
      `${LEDGER_PATH}: ${row.commit} has no issue column - use the tracker id, or "-" when the commit carries none`,
    );
  }
  const key = `${row.commit} ${row.issue}`;
  if (ledgerCommits.has(key)) {
    problems.push(`${LEDGER_PATH}: ${key} is listed twice`);
  }
  ledgerCommits.set(key, row);
}

const caseCommits = new Map();
for (const entry of catalog) {
  const isSentinel = entry.issue.startsWith("sentinel/");
  const commits = entry.sourceCommits ?? [];
  if (commits.length === 0 && !isSentinel) {
    problems.push(
      `${entry.path}: bug ${entry.issue} declares no sourceCommits — the next triage pass would surface its fix again as an uncovered candidate`,
    );
  }
  for (const commit of commits) {
    if (!SHA_PATTERN.test(commit)) {
      problems.push(
        `${entry.path}: sourceCommits entry "${commit}" is not a short SHA (7-40 hex characters)`,
      );
    }
    if (ledgerCommits.has(`${commit} ${entry.issue}`)) {
      problems.push(
        `${commit} ${entry.issue} is both settled by ${entry.id} and skipped in ${LEDGER_PATH} - it cannot be both`,
      );
    }
    const claimedBy = caseCommits.get(commit) ?? [];
    caseCommits.set(commit, [...claimedBy, entry.id]);
  }
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  console.error(`check:source-commits failed (${problems.length} problems)`);
  process.exit(1);
}

console.log(
  `Triage record ok: ${caseCommits.size} commits settled by cases, ${ledgerCommits.size} examined and skipped.`,
);
