// Everything committed here is written in English: code, comments, docs, case
// titles, and the strings the reports emit.
//
// This is a public repository, and the check exists because the drift is
// gradual and invisible in review — one Chinese sentence in a case doc, one
// Chinese label in the comparison table, and a contributor who does not read it
// is locked out of exactly the part that explains WHY a case is shaped the way
// it is. Catching it here costs a second; catching it after publication means
// rewriting docs someone has already read.
//
// Scope is every tracked file, since a reader meets the repository through all
// of them. Deliberately not scanned: the lockfile (generated), and binary or
// image content (nothing to read).

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = promisify(execFile);

// CJK ideographs plus the full-width punctuation that comes with them — the
// full-width forms matter on their own, because a stray "，" or "（）" left
// behind by a half-finished translation is exactly the kind of thing that
// survives a read-through.
const CJK = /[　-〿㐀-䶿一-鿿豈-﫿！-｠]/;

const SKIP_FILES = new Set(["pnpm-lock.yaml"]);
const SKIP_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".woff",
  ".woff2",
];

const isSkipped = (path) =>
  SKIP_FILES.has(path) ||
  SKIP_EXTENSIONS.some((extension) => path.endsWith(extension));

const { stdout } = await run("git", ["ls-files", "-z"], { cwd: repoRoot });
const files = stdout
  .split("\0")
  .filter(Boolean)
  .filter((path) => !isSkipped(path));

const problems = [];
for (const path of files) {
  let source;
  try {
    source = await readFile(join(repoRoot, path), "utf8");
  } catch {
    // Unreadable as text means there is nothing here to read in any language.
    continue;
  }
  if (!CJK.test(source)) {
    continue;
  }
  source.split("\n").forEach((line, index) => {
    if (CJK.test(line)) {
      problems.push(`${path}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (problems.length > 0) {
  console.error(
    `Non-English text in ${problems.length} line(s). This repository is public and English-only:\n`,
  );
  // Every offending line, not a sample: a truncated list turns one fix-and-run
  // cycle into several.
  for (const problem of problems) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}

console.log(`English-only check ok (${files.length} files)`);
