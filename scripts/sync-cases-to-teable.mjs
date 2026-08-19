// Publish the case catalog to the "E2E Bug Cases (readonly)" table, upserted
// by Case ID. Runs on push to main when cases or the registry change; the
// table is a read surface for humans, never an input to any run — the
// registry stays the single source of truth.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCaseCatalog } from "./case-catalog.mjs";
import { env } from "./env.mjs";
import {
  buildCaseRecord,
  createTeableRequest,
  DEFAULT_CASES_CASE_ID_FIELD_ID,
  DEFAULT_CASES_TABLE_ID,
  DEFAULT_ENDPOINT,
  upsertRecordsByKey,
} from "./teable-track.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const main = async () => {
  const token = env("TEABLE_E2E_LAB_TOKEN");
  if (!token) {
    console.log("TEABLE_E2E_LAB_TOKEN is not set; skipping the case sync.");
    return;
  }

  const catalog = await loadCaseCatalog(repoRoot);
  const repository = env("GITHUB_REPOSITORY", "teableio/teable-e2e-lab");
  const sourceSha = env("GITHUB_SHA", "local");
  const syncedAt = new Date().toISOString();

  const records = catalog.map((entry) =>
    buildCaseRecord({ entry, repository, sourceSha, syncedAt }),
  );

  const request = createTeableRequest({
    endpoint: env("TEABLE_E2E_LAB_ENDPOINT", DEFAULT_ENDPOINT),
    token,
  });
  const { created, updated } = await upsertRecordsByKey({
    request,
    tableId: env("TEABLE_E2E_LAB_CASES_TABLE_ID", DEFAULT_CASES_TABLE_ID),
    keyFieldId: env(
      "TEABLE_E2E_LAB_CASES_CASE_ID_FIELD_ID",
      DEFAULT_CASES_CASE_ID_FIELD_ID,
    ),
    keyFieldName: "Case ID",
    records,
  });
  console.log(
    `E2E Bug Cases: ${created} created, ${updated} updated of ${records.length} registered.`,
  );
  // Cases removed from the registry keep their rows — history should explain
  // old Regression Track rows, and deleting is a human judgment. A retired
  // case is visible by its Source SHA falling behind.
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
