// Acceptance runs publish their artifacts from a public repository, so a case
// payload keeps only what the comparison needs: which case ran, on which
// commit, and how it ended. Everything else in the directory is removed.

import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const WITHHELD = "withheld in acceptance mode";

export const sanitizePayload = (payload) => ({
  caseId: payload.caseId,
  title: payload.title,
  bug: { issue: payload.bug?.issue, status: payload.bug?.status },
  commitSha: payload.commitSha,
  engine: payload.engine,
  observed: payload.observed,
  verdict: payload.verdict,
  gating: payload.gating,
  durationMs: payload.durationMs,
  ...(payload.reproduction
    ? { reproduction: { checkpoint: payload.reproduction.checkpoint } }
    : {}),
  ...(payload.error ? { error: { message: WITHHELD } } : {}),
});

const isPayload = (value) =>
  typeof value?.caseId === "string" &&
  typeof value?.commitSha === "string" &&
  typeof value?.verdict === "string";

export const sanitizeDirectory = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  let kept = 0;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      kept += await sanitizeDirectory(path);
      continue;
    }
    let parsed;
    if (entry.name.endsWith(".json")) {
      parsed = await readFile(path, "utf8")
        .then(JSON.parse)
        .catch(() => undefined);
    }
    if (isPayload(parsed)) {
      await writeFile(
        path,
        `${JSON.stringify(sanitizePayload(parsed), null, 2)}\n`,
      );
      kept += 1;
    } else {
      await rm(path, { force: true });
    }
  }
  return kept;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (!directory) {
    throw new Error("Usage: sanitize-acceptance-payloads.mjs <directory>");
  }
  console.log(`Kept ${await sanitizeDirectory(directory)} case payloads.`);
}
