import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sanitizeDirectory } from "./sanitize-acceptance-payloads.mjs";

test("keeps the verdict and removes everything that can carry server data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "acceptance-payloads-"));
  await writeFile(
    join(directory, "case-v2.json"),
    JSON.stringify({
      caseId: "group/case",
      title: "A case",
      bug: { issue: "T1", status: "fixed", sourceCommits: ["abc"] },
      commitSha: "a".repeat(40),
      engine: "v2",
      appUrl: "http://127.0.0.1:3000",
      observed: "error",
      verdict: "error",
      gating: true,
      durationMs: 12,
      details: { sql: "select secret" },
      error: { message: "select secret", stack: "at secret" },
      reproduction: { checkpoint: "step", evidence: { body: "secret" } },
    }),
  );
  await writeFile(join(directory, "summary-case-v2.md"), "secret");
  await writeFile(join(directory, "other.json"), '{"sql":"secret"}');

  assert.equal(await sanitizeDirectory(directory), 1);
  assert.deepEqual(await readdir(directory), ["case-v2.json"]);
  const written = await readFile(join(directory, "case-v2.json"), "utf8");
  assert.doesNotMatch(written, /secret|appUrl|sourceCommits/);
  const payload = JSON.parse(written);
  assert.equal(payload.verdict, "error");
  assert.equal(payload.reproduction.checkpoint, "step");
  assert.equal(payload.error.message, "withheld in acceptance mode");
});
