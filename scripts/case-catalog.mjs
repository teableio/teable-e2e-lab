// Single source of truth for the case catalog OUTSIDE the injected runtime.
//
// The planner, the comparison table, and the checks all need to enumerate
// cases, but the case files only resolve inside the teable-ee monorepo (they
// import @teable/* packages). So this module reads the catalog statically —
// case files on disk, registry imports, the registered array — the same
// approach perf-lab's case-catalog.mjs settled on after two scripts with two
// regexes drifted silently.
//
// The static contract this parsing relies on (guarded by check-case-docs):
// `id`, `issue`, and `status` in a case file are string literals, never
// computed.

import { readdir, readFile, access } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

const readText = (path) => readFile(path, "utf8");

export const fileExists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const normalizePath = (path) => path.replaceAll("\\", "/");

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walk(path)));
      continue;
    }
    paths.push(path);
  }
  return paths;
};

// Every `cases/**/*.case.ts` on disk, repo-relative and sorted.
export const findCaseFilesOnDisk = async (repoRoot) =>
  (await walk(join(repoRoot, "cases")))
    .filter((path) => path.endsWith(".case.ts"))
    .map((path) => normalizePath(relative(repoRoot, path)))
    .sort();

export const getMarkdownPath = (casePath) =>
  normalizePath(
    join(dirname(casePath), `${basename(casePath, ".case.ts")}.md`),
  );

// Parse registry.ts: default-import name -> case path, and the registered
// `cases` array in its curated order.
export const loadRegistry = async (repoRoot) => {
  const registry = await readText(join(repoRoot, "registry.ts"));

  const imports = [
    ...registry.matchAll(
      /import\s+(\w+)\s+from\s+["']\.\/(cases\/[^"']+\.case)["'];?/g,
    ),
  ].map((match) => ({ name: match[1], path: `${match[2]}.ts` }));
  const pathByImport = new Map(
    imports.map((entry) => [entry.name, entry.path]),
  );

  const arrayMatch = registry.match(
    /const cases = \[([\s\S]*?)\] satisfies BugCase\[\]/,
  );
  if (!arrayMatch) {
    throw new Error("Could not parse the registry.ts cases array");
  }
  const arrayEntries = arrayMatch[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return { imports, pathByImport, arrayEntries };
};

const literalField = (source, name, path) => {
  const match = source.match(new RegExp(`${name}:\\s*["']([^"']+)["']`));
  if (!match) {
    throw new Error(
      `${path}: could not find a string-literal \`${name}:\` — the static catalog contract requires it`,
    );
  }
  return match[1];
};

// Optional numeric literal (e.g. `timeoutMs: 60_000`). Returns undefined when
// absent rather than throwing — only the identity fields are contractual.
const numericField = (source, name) => {
  const match = source.match(new RegExp(`${name}:\\s*([\\d_]+)`));
  return match ? Number(match[1].replaceAll("_", "")) : undefined;
};

// Optional array-of-string-literals (e.g. `sourceCommits: ["a1b2c3d"]`).
// Returns [] when absent: a sentinel that guards no single commit is allowed
// to have none, and check-source-commits decides who may omit it.
const literalArrayField = (source, name) => {
  const match = source.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
  if (!match) {
    return [];
  }
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((entry) => entry[1]);
};

const optionalLiteralField = (source, name) => {
  const match = source.match(new RegExp(`${name}:\\s*["']([^"']+)["']`));
  return match ? match[1] : undefined;
};

// The catalog: one entry per REGISTERED case, in registry array order, each
// carrying {id, path, issue, status}, the teable-ee commits the case settles,
// plus the display extras the Teable case sync publishes (title, timeoutMs,
// link).
export const loadCaseCatalog = async (repoRoot) => {
  const { pathByImport, arrayEntries } = await loadRegistry(repoRoot);
  const catalog = [];
  for (const importName of arrayEntries) {
    const path = pathByImport.get(importName);
    if (!path) {
      throw new Error(
        `registry.ts registers \`${importName}\` but has no matching case import`,
      );
    }
    const source = await readText(join(repoRoot, path));
    catalog.push({
      path,
      id: literalField(source, "id", path),
      issue: literalField(source, "issue", path),
      status: literalField(source, "status", path),
      title: literalField(source, "title", path),
      runner: literalField(source, "runner", path),
      timeoutMs: numericField(source, "timeoutMs"),
      link: optionalLiteralField(source, "link"),
      appliesSince: optionalLiteralField(source, "appliesSince"),
      sourceCommits: literalArrayField(source, "sourceCommits"),
    });
  }
  return catalog;
};

// Filter semantics duplicated (intentionally trivially) from registry.ts's
// resolveBugCaseIds — see the comment there for why both stay this small.
export const resolveCaseFilter = (caseFilter, allCaseIds) => {
  const trimmed = (caseFilter ?? "").trim();
  if (!trimmed || trimmed === "all" || trimmed === "*") {
    return [...allCaseIds];
  }
  const known = new Set(allCaseIds);
  const caseIds = [
    ...new Set(
      trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  const unknown = caseIds.filter((caseId) => !known.has(caseId));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown case id(s) in filter: ${unknown.join(", ")}. Available: ${[...allCaseIds].join(", ")}, or "all".`,
    );
  }
  return caseIds;
};
