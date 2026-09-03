// Report-job entry: write every case payload of this run into the Regression
// Track table (base bselS3I2MeVI6RJhS4g), one row per case x commit, upserted
// by Run Key so a re-reported attempt updates its own rows instead of
// tripping the unique constraint.
//
// Best-effort by design: the workflow runs this continue-on-error and gated on
// the token being present. The artifacts, not this table, are the source of
// truth — the table exists so history is queryable without downloading them.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { env, requiredEnv } from "./env.mjs";
import {
  buildTrackRecord,
  createTeableRequest,
  DEFAULT_ENDPOINT,
  DEFAULT_TRACK_RUN_KEY_FIELD_ID,
  DEFAULT_TRACK_TABLE_ID,
  upsertRecordsByKey,
} from "./teable-track.mjs";

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

const sanitizeCaseId = (caseId) =>
  caseId.replaceAll("/", "-").replace(/[^a-zA-Z0-9_.-]+/g, "-");

const main = async () => {
  const token = env("TEABLE_E2E_LAB_TOKEN");
  if (!token) {
    console.log("TEABLE_E2E_LAB_TOKEN is not set; skipping the Teable report.");
    return;
  }

  const artifactDir = requiredEnv("E2E_LAB_ARTIFACT_DIR");
  const executePlan = JSON.parse(requiredEnv("E2E_LAB_EXECUTE_PLAN"));
  const planBySha = new Map(executePlan.map((entry) => [entry.sha, entry]));

  const runId = env("GITHUB_RUN_ID", "local");
  const runAttempt = env("GITHUB_RUN_ATTEMPT", "0");
  const repository = env("GITHUB_REPOSITORY", "teableio/teable-e2e-lab");
  const runUrl =
    env("GITHUB_RUN_ID") && env("GITHUB_REPOSITORY")
      ? `https://github.com/${repository}/actions/runs/${runId}`
      : "";

  const records = [];
  let skippedUnplanned = 0;
  let skippedReference = 0;
  for (const path of await walk(artifactDir)) {
    if (!path.endsWith(".json")) {
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(await readFile(path, "utf8"));
    } catch {
      continue;
    }
    if (!isPayload(payload)) {
      continue;
    }
    // The track carries the GUARDED column only.
    //
    // Its Run Key is (run, attempt, case, commit) — no engine — so two engines
    // writing for one case would silently overwrite each other rather than
    // land as two rows. Widening the key is possible but would change what
    // every historical row means, and the v1 column does not want a queryable
    // history: it is read once, in the run summary, beside the run that
    // produced it. v1 payloads stay in the artifact.
    if (payload.engine === "v1") {
      skippedReference += 1;
      continue;
    }
    const planEntry = planBySha.get(payload.commitSha);
    if (!planEntry) {
      // The acceptance gate already fails the run for these; the table only
      // carries rows the plan can explain.
      skippedUnplanned += 1;
      continue;
    }
    const summaryPath = join(
      path.slice(0, path.lastIndexOf("/")),
      `summary-${sanitizeCaseId(payload.caseId)}.md`,
    );
    const summaryMarkdown = await readFile(summaryPath, "utf8").catch(() => "");
    records.push(
      buildTrackRecord({
        payload,
        planEntry,
        runUrl,
        workflow: env("GITHUB_WORKFLOW_REF", "e2e-lab.yml").split("@")[0],
        runId,
        runAttempt,
        e2eLabSha: env("GITHUB_SHA", ""),
        summaryMarkdown,
      }),
    );
  }

  if (records.length === 0) {
    // Distinguishable from a quiet success on purpose — an empty report from a
    // run that executed cases means the payload transport broke.
    throw new Error(`No case payloads found under ${artifactDir}.`);
  }

  const request = createTeableRequest({
    endpoint: env("TEABLE_E2E_LAB_ENDPOINT", DEFAULT_ENDPOINT),
    token,
  });
  const { created, updated } = await upsertRecordsByKey({
    request,
    tableId: env("TEABLE_E2E_LAB_TRACK_TABLE_ID", DEFAULT_TRACK_TABLE_ID),
    keyFieldId: env(
      "TEABLE_E2E_LAB_TRACK_RUN_KEY_FIELD_ID",
      DEFAULT_TRACK_RUN_KEY_FIELD_ID,
    ),
    keyFieldName: "Run Key",
    records,
  });
  console.log(
    `Regression Track: ${created} created, ${updated} updated` +
      (skippedUnplanned > 0 ? `, ${skippedUnplanned} unplanned skipped` : "") +
      (skippedReference > 0
        ? `, ${skippedReference} v1 reference payload(s) not tracked`
        : "") +
      ".",
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
