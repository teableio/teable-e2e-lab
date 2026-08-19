import assert from "node:assert/strict";
import { buildCaseRecord, buildTrackRecord } from "./teable-track.mjs";

const sha = (seed) => seed.repeat(40).slice(0, 40);

// A representative payload, shaped exactly like framework/artifacts.ts writes.
const payload = {
  caseId: "record/bulk-update-100-mixed-lands",
  title: "批量更新 100 行的每一个字段后，每一格都真的落库",
  bug: { issue: "sentinel/record-bulk-update-lands", status: "fixed" },
  runId: "123-1",
  commitSha: sha("a"),
  appUrl: "http://127.0.0.1:3000",
  observed: "present",
  verdict: "regression",
  gating: true,
  startedAt: "2026-08-19T09:00:00.000Z",
  finishedAt: "2026-08-19T09:01:00.000Z",
  durationMs: 60000.129,
  details: { batches: [{ batch: 1, status: 200 }] },
  error: { message: "3 cells did not land", status: 200 },
  reproduction: { checkpoint: "every-cell-landed", evidence: { misses: 3 } },
};

const planEntry = {
  name: "c2-aaaaaaaaaa",
  position: 2,
  ref: "develop",
  sha: sha("a"),
  short: sha("a").slice(0, 10),
  artifactSuffix: sha("a").slice(0, 10),
  gating: true,
};

{
  const record = buildTrackRecord({
    payload,
    planEntry,
    runUrl: "https://github.com/teableio/teable-e2e-lab/actions/runs/123",
    workflow: "e2e-lab.yml",
    runId: "123",
    runAttempt: "1",
    e2eLabSha: sha("b"),
    summaryMarkdown: "### summary",
  });
  const fields = record.fields;
  assert.equal(
    fields["Run Key"],
    `123-1-record/bulk-update-100-mixed-lands-${sha("a").slice(0, 10)}`,
  );
  assert.equal(fields.Verdict, "regression");
  assert.equal(fields.Observed, "present");
  assert.equal(fields.Gating, true);
  assert.equal(fields["Teable EE SHA"], sha("a"));
  assert.equal(fields["Commit Position"], 2);
  assert.equal(fields["Run Attempt"], 1);
  assert.equal(fields["Duration Ms"], 60000.13);
  assert.equal(fields.Checkpoint, "every-cell-landed");
  assert.match(fields["Evidence JSON"], /misses/);
  assert.match(fields.Error, /did not land/);
  assert.equal(
    fields["Artifact Name"],
    `e2e-lab-results-${sha("a").slice(0, 10)}-123`,
  );
}

// A pass payload has no error/reproduction; the row must still build, with
// empty strings rather than the literal "undefined".
{
  const record = buildTrackRecord({
    payload: {
      ...payload,
      observed: "absent",
      verdict: "pass",
      error: undefined,
      reproduction: undefined,
    },
    planEntry,
    runUrl: "",
    workflow: "",
    runId: "123",
    runAttempt: "2",
    e2eLabSha: "",
    summaryMarkdown: "",
  });
  assert.equal(record.fields.Error, "");
  assert.equal(record.fields.Checkpoint, "");
  assert.equal(record.fields["Evidence JSON"], "");
}

{
  const record = buildCaseRecord({
    entry: {
      id: "smoke/auth-user",
      path: "cases/smoke/auth-user.case.ts",
      issue: "sentinel/harness-health",
      status: "fixed",
      title: "Seeded user can read their own profile",
      runner: "http-check",
      timeoutMs: 60000,
    },
    repository: "teableio/teable-e2e-lab",
    sourceSha: sha("c"),
    syncedAt: "2026-08-19T10:00:00.000Z",
  });
  const fields = record.fields;
  assert.equal(fields["Case ID"], "smoke/auth-user");
  assert.equal(fields["Doc Path"], "cases/smoke/auth-user.md");
  assert.match(fields["Doc URL"], /blob\/main\/cases\/smoke\/auth-user\.md$/);
  assert.match(fields["CI Reproduce Command"], /case_filter=smoke\/auth-user/);
  assert.equal(fields["Timeout Ms"], 60000);
  assert.equal(fields["Declared Status"], "fixed");
}

console.log("track record model ok");
