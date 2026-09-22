import assert from "node:assert/strict";
import {
  buildCaseRecord,
  buildTrackRecord,
  upsertRecordsByKey,
} from "./teable-track.mjs";

const sha = (seed) => seed.repeat(40).slice(0, 40);

// A representative payload, shaped exactly like framework/artifacts.ts writes.
const payload = {
  caseId: "record/y154-bulk-update-100-mixed-lands",
  title: "Bulk-updating 100 rows lands on every single cell",
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
    `123-1-record/y154-bulk-update-100-mixed-lands-${sha("a").slice(0, 10)}`,
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
      id: "smoke/y153-auth-user",
      path: "cases/smoke/y153-auth-user.case.ts",
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
  assert.equal(fields["Case ID"], "smoke/y153-auth-user");
  assert.equal(fields["Doc Path"], "cases/smoke/y153-auth-user.md");
  assert.match(
    fields["Doc URL"],
    /blob\/main\/cases\/smoke\/y153-auth-user\.md$/,
  );
  assert.match(
    fields["CI Reproduce Command"],
    /case_filter=smoke\/y153-auth-user/,
  );
  assert.equal(fields["Timeout Ms"], 60000);
  assert.equal(fields["Declared Status"], "fixed");
}

// Exercise the real upsert against an in-memory API, including the encoded
// request target. Unicode and URL metacharacters must count after encoding.
{
  const tableId = "tblTrackLookupTest";
  const keyFieldId = "fldRunKeyLookupTest";
  const keyFieldName = "Run Key";
  const records = Array.from({ length: 125 }, (_, index) => ({
    fields: {
      [keyFieldName]:
        index === 124
          ? `large-${"a".repeat(5500)}`
          : `123-1-record/${index}-${"\u8def\u5f84 /?&%=+".repeat(2 + (index % 7))}-${sha("a")}`,
      Verdict: "regression",
    },
  }));
  const stored = new Map();
  const lookupKeys = [];
  const writes = [];
  const request = async ({ method, path, body }) => {
    const url = new URL(`https://example.invalid/api${path}`);
    assert.equal(url.pathname, `/api/table/${tableId}/record`);
    if (method === "GET") {
      assert.ok(Buffer.byteLength(url.pathname + url.search) <= 6000);
      assert.equal(url.searchParams.get("fieldKeyType"), "name");
      assert.deepEqual(url.searchParams.getAll("projection[]"), [keyFieldId]);
      assert.equal(url.searchParams.has("projection"), false);
      const filter = JSON.parse(url.searchParams.get("filter"));
      assert.equal(filter.conjunction, "or");
      assert.equal(
        Number(url.searchParams.get("take")),
        filter.filterSet.length,
      );
      const matches = [];
      for (const term of filter.filterSet) {
        assert.equal(term.fieldId, keyFieldId);
        assert.equal(term.operator, "is");
        lookupKeys.push(term.value);
        const record = stored.get(term.value);
        if (record) {
          matches.push({
            id: record.id,
            fields: { [keyFieldName]: record.fields[keyFieldName] },
          });
        }
      }
      return { records: matches };
    }
    assert.ok(method === "POST" || method === "PATCH");
    assert.equal(body.fieldKeyType, "name");
    assert.equal(body.typecast, true);
    assert.ok(body.records.length <= 50);
    writes.push([method, body.records.length]);
    for (const record of body.records) {
      const key = record.fields[keyFieldName];
      const existing = stored.get(key);
      if (method === "POST") {
        assert.equal(
          existing,
          undefined,
          "upsert must not create duplicate keys",
        );
      } else {
        assert.equal(
          record.id,
          existing?.id,
          "update must target the existing row",
        );
      }
      stored.set(key, {
        id: existing?.id ?? `rec${stored.size}`,
        fields: { ...record.fields },
      });
    }
  };
  const upsert = (rows) =>
    upsertRecordsByKey({
      request,
      tableId,
      keyFieldId,
      keyFieldName,
      records: rows,
    });
  const expectedKeys = records.map((record) => record.fields[keyFieldName]);
  assert.deepEqual(await upsert(records), { created: 125, updated: 0 });
  assert.deepEqual(lookupKeys, expectedKeys);
  assert.deepEqual(writes, [
    ["POST", 50],
    ["POST", 50],
    ["POST", 25],
  ]);
  assert.deepEqual(
    [...stored.values()].map(({ fields }) => ({ fields })),
    records,
  );
  const ids = [...stored.values()].map(({ id }) => id);
  lookupKeys.length = 0;
  writes.length = 0;
  const rerun = records.map(({ fields }) => ({
    fields: { ...fields, Verdict: "pass" },
  }));
  assert.deepEqual(await upsert(rerun), { created: 0, updated: 125 });
  assert.deepEqual(lookupKeys, expectedKeys);
  assert.deepEqual(writes, [
    ["PATCH", 50],
    ["PATCH", 50],
    ["PATCH", 25],
  ]);
  assert.deepEqual(
    [...stored.values()].map(({ fields }) => ({ fields })),
    rerun,
  );
  assert.deepEqual(
    [...stored.values()].map(({ id }) => id),
    ids,
  );

  lookupKeys.length = 0;
  writes.length = 0;
  await assert.rejects(
    upsert([{ fields: { [keyFieldName]: "\u8def\u5f84".repeat(1000) } }]),
    /single key.*6000-byte request-target limit/i,
  );
  assert.deepEqual(lookupKeys, []);
  assert.deepEqual(writes, []);
}

console.log("track record model ok");
