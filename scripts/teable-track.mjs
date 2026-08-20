// Shared plumbing for the two Teable writers (report-teable-track and
// sync-cases-to-teable), plus the pure record builders so they can be checked
// without a network (check-track-model.mjs).
//
// The write pattern is teable-perf-lab's, condensed: Bearer token, batched
// POST/PATCH of /table/{id}/record with fieldKeyType "name" + typecast, retry
// on 429/5xx, and upsert-by-unique-key. One lesson carried over verbatim:
// FILTERS ADDRESS COLUMNS BY FIELD ID, never by name — Teable answers 200
// after silently dropping a filter whose field name no longer exists, and a
// dropped filter turns "find my row" into "the whole table".

export const DEFAULT_ENDPOINT = "https://app.teable.ai";
export const DEFAULT_TRACK_TABLE_ID = "tblhDr6yHUAkEMcJuNC";
export const DEFAULT_TRACK_RUN_KEY_FIELD_ID = "fld0k1WIhUlyoxmxEzH";
export const DEFAULT_CASES_TABLE_ID = "tblgKLRoSAiKsIP7ZKi";
export const DEFAULT_CASES_CASE_ID_FIELD_ID = "fldU8j6AR0TkAWuyJbO";

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
// Teable rejects oversized writes; long error bodies and summaries are already
// truncated at capture time, so a conservative per-request batch keeps every
// request well under the API limit without a byte-accounting model.
const WRITE_BATCH_SIZE = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const createTeableRequest = ({ endpoint, token }) => {
  const base = `${endpoint.replace(/\/+$/, "")}/api`;
  return async ({ method, path, body }) => {
    for (let attempt = 1; ; attempt += 1) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : undefined;
      }
      if (RETRYABLE_STATUS_CODES.has(res.status) && attempt < MAX_ATTEMPTS) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter >= 0
            ? retryAfter * 1000
            : Math.min(1000 * 2 ** (attempt - 1), 5000),
        );
        continue;
      }
      throw new Error(
        `Teable ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 500)}`,
      );
    }
  };
};

// Upsert each record by its unique key column. Records whose key already has a
// row are PATCHed; the rest are POSTed. This is what makes a re-reported run
// attempt idempotent instead of tripping the unique constraint.
export const upsertRecordsByKey = async ({
  request,
  tableId,
  keyFieldId,
  keyFieldName,
  records,
}) => {
  let created = 0;
  let updated = 0;
  for (let index = 0; index < records.length; index += WRITE_BATCH_SIZE) {
    const batch = records.slice(index, index + WRITE_BATCH_SIZE);
    const params = new URLSearchParams({
      fieldKeyType: "name",
      take: String(batch.length),
      // One OR across the batch keys — a single bounded read instead of a
      // request per record.
      filter: JSON.stringify({
        conjunction: "or",
        filterSet: batch.map((record) => ({
          fieldId: keyFieldId,
          operator: "is",
          value: record.fields[keyFieldName],
        })),
      }),
    });
    // Repeated `projection[]` params, NOT a JSON-encoded array. Measured on
    // 2026-08-19: `projection=["fldXXX"]` gets a 200 whose every record has
    // `fields: {}` — the degraded read that made the first sync create
    // duplicates instead of updating. Same silent-degradation family as
    // filters naming a missing field.
    params.append("projection[]", keyFieldId);
    const found = await request({
      method: "GET",
      path: `/table/${tableId}/record?${params.toString()}`,
    });
    const existingByKey = new Map(
      (found?.records ?? []).map((record) => [
        record.fields[keyFieldName],
        record.id,
      ]),
    );

    const updates = [];
    const creates = [];
    for (const record of batch) {
      const existingId = existingByKey.get(record.fields[keyFieldName]);
      if (existingId) {
        updates.push({ id: existingId, fields: record.fields });
      } else {
        creates.push(record);
      }
    }
    if (updates.length > 0) {
      await request({
        method: "PATCH",
        path: `/table/${tableId}/record`,
        body: { fieldKeyType: "name", typecast: true, records: updates },
      });
      updated += updates.length;
    }
    if (creates.length > 0) {
      await request({
        method: "POST",
        path: `/table/${tableId}/record`,
        body: { fieldKeyType: "name", typecast: true, records: creates },
      });
      created += creates.length;
    }
  }
  return { created, updated };
};

const truncate = (text, max = 20000) =>
  typeof text === "string" && text.length > max
    ? `${text.slice(0, max)}… (${text.length} chars)`
    : text;

// One Regression Track row from one case payload plus its plan column.
// Pure — checked by check-track-model.mjs.
export const buildTrackRecord = ({
  payload,
  planEntry,
  runUrl,
  workflow,
  runId,
  runAttempt,
  e2eLabSha,
  summaryMarkdown,
}) => ({
  fields: {
    "Run Key": `${runId}-${runAttempt}-${payload.caseId}-${planEntry.short}`,
    Verdict: payload.verdict,
    Observed: payload.observed,
    Gating: Boolean(planEntry.gating),
    "Case ID": payload.caseId,
    "Case Title": payload.title ?? payload.caseId,
    Issue: payload.bug?.issue ?? "",
    "Declared Status": payload.bug?.status ?? "",
    "Teable EE Ref": planEntry.ref,
    "Teable EE SHA": payload.commitSha,
    "Commit Position": planEntry.position,
    "E2E Lab SHA": e2eLabSha ?? "",
    "Run ID": String(runId),
    "Run Attempt": Number(runAttempt),
    Workflow: workflow ?? "",
    "Run URL": runUrl ?? "",
    "Artifact Name": `e2e-lab-results-${planEntry.artifactSuffix}-${runId}`,
    "Duration Ms":
      typeof payload.durationMs === "number"
        ? Math.round(payload.durationMs * 100) / 100
        : null,
    "Started At": payload.startedAt ?? null,
    "Finished At": payload.finishedAt ?? null,
    Checkpoint: payload.reproduction?.checkpoint ?? "",
    "Evidence JSON": payload.reproduction?.evidence
      ? truncate(JSON.stringify(payload.reproduction.evidence))
      : "",
    "Details JSON": payload.details
      ? truncate(JSON.stringify(payload.details))
      : "",
    Error: payload.error ? truncate(JSON.stringify(payload.error)) : "",
    "Summary Markdown": truncate(summaryMarkdown ?? ""),
  },
});

// One E2E Bug Cases row from one catalog entry. Pure — checked alongside.
export const buildCaseRecord = ({
  entry,
  repository,
  sourceSha,
  syncedAt,
}) => ({
  fields: {
    "Case ID": entry.id,
    Title: entry.title,
    Issue: entry.issue,
    "Issue Link": entry.link ?? "",
    "Declared Status": entry.status,
    Runner: entry.runner ?? "",
    "Applies Since": entry.appliesSince ?? "",
    "Timeout Ms": entry.timeoutMs ?? null,
    "Case Path": entry.path,
    "Doc Path": entry.path.replace(/\.case\.ts$/, ".md"),
    "Doc URL": `https://github.com/${repository}/blob/main/${entry.path.replace(/\.case\.ts$/, ".md")}`,
    "CI Reproduce Command": `gh workflow run e2e-lab.yml --repo ${repository} --ref main -f teable_ee_commits=develop -f case_filter=${entry.id}`,
    "Local Reproduce Command": `E2E_LAB_CASE_FILTER=${entry.id} npx vitest run --config ./vitest-e2e-lab.config.ts`,
    "Source SHA": sourceSha,
    "Synced At": syncedAt,
  },
});
