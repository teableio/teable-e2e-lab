import { FieldKeyType } from "@teable/core";
import { updateRecords } from "@teable/openapi";
import {
  createRecords,
  createTable,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { chunk } from "../chunk";
import { bugCheckpoint } from "../checkpoint";
import { normalizeBugError } from "../bug-error";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RecordFlowCaseConfig, RecordFlowFieldSpec } from "../types";
import {
  diffRow,
  expectedRow,
  rowMatchesRevision,
  updatePayloadRow,
} from "./record-values";

// Create table -> seed revision 1 -> prove the seed landed -> bulk-update every
// row to revision 2 -> checkpoint: prove revision 2 landed everywhere.
//
// The phase boundary carries the verdict semantics: everything before the
// checkpoint failing means "the case could not run" (error 💥), the checkpoint
// failing means "the bug reproduced" (present ❌/⬜). The seed verification is
// deliberately on the error side — every conclusion below rests on "the rows
// start at values that differ from the targets", and if the seed itself did not
// land, a completely broken update would still scan clean.
const DEFAULT_PAGE_SIZE = 100;
const MAX_REPORTED_MISMATCHES = 10;

type ScanResult = {
  recordIds: string[];
  mismatches: string[];
  rowsAtSeedRevision: number;
};

const fullScan = async (
  tableId: string,
  config: RecordFlowCaseConfig,
  revision: 1 | 2,
): Promise<ScanResult> => {
  const pageSize = config.fullScanPageSize ?? DEFAULT_PAGE_SIZE;
  const recordIds: string[] = [];
  const mismatches: string[] = [];
  let rowsAtSeedRevision = 0;

  for (let skip = 0; skip < config.recordCount; skip += pageSize) {
    const expectedTake = Math.min(pageSize, config.recordCount - skip);
    const page = await getRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      skip,
      take: expectedTake,
    });
    if (page.records.length !== expectedTake) {
      throw new Error(
        `Expected ${expectedTake} records at skip ${skip}, got ${page.records.length}`,
      );
    }
    for (const [index, record] of page.records.entries()) {
      const rowNumber = skip + index + 1;
      recordIds.push(record.id);
      mismatches.push(
        ...diffRow(
          config.fields,
          rowNumber,
          record.fields,
          expectedRow(config.fields, rowNumber, revision),
        ),
      );
      if (
        revision === 2 &&
        rowMatchesRevision(config.fields, rowNumber, record.fields, 1)
      ) {
        rowsAtSeedRevision += 1;
      }
    }
  }

  return { recordIds, mismatches, rowsAtSeedRevision };
};

const seedRevisionOne = async (
  tableId: string,
  config: RecordFlowCaseConfig,
): Promise<void> => {
  const rows = Array.from({ length: config.recordCount }, (_, index) => ({
    fields: expectedRow(config.fields, index + 1, 1),
  }));
  for (const batch of chunk(rows, config.batchSize)) {
    await createRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: batch,
    });
  }
};

type UpdateBatchOutcome = {
  batch: number;
  status?: number;
  echoedRecords?: number;
  error?: string;
};

// A batch that fails is recorded, not thrown: "how many of the 100 rows were
// updated" is the most useful fact when diagnosing this class of failure, and
// throwing on the first bad batch discards it. The checkpoint judges the
// collected outcomes afterwards.
const updateToRevisionTwo = async (
  tableId: string,
  config: RecordFlowCaseConfig,
  recordIds: string[],
): Promise<UpdateBatchOutcome[]> => {
  const updates = recordIds.map((id, index) => ({
    id,
    fields: updatePayloadRow(config.fields, index + 1, 2),
  }));
  const outcomes: UpdateBatchOutcome[] = [];
  for (const [batchIndex, batch] of chunk(
    updates,
    config.batchSize,
  ).entries()) {
    try {
      const response = await updateRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        typecast: false,
        records: batch,
      });
      const echoed = Array.isArray(response.data) ? response.data.length : 0;
      outcomes.push({
        batch: batchIndex + 1,
        status: response.status,
        echoedRecords: echoed,
      });
    } catch (error) {
      const normalized = normalizeBugError(error);
      outcomes.push({
        batch: batchIndex + 1,
        status: normalized.status,
        error: normalized.response ?? normalized.message,
      });
    }
  }
  return outcomes;
};

export const runRecordFlowCase = async (
  bugCase: BugCaseFor<"record-flow">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: config.fields.map((field: RecordFlowFieldSpec) => ({
        name: field.name,
        type: field.type,
      })),
      records: [],
    });
    tableId = table.id;

    await seedRevisionOne(tableId, config);
    const seedScan = await fullScan(tableId, config, 1);
    if (seedScan.mismatches.length > 0) {
      throw new Error(
        `Seed did not land — the case cannot run: ${seedScan.mismatches
          .slice(0, MAX_REPORTED_MISMATCHES)
          .join("; ")}`,
      );
    }

    const outcomes = await updateToRevisionTwo(
      tableId,
      config,
      seedScan.recordIds,
    );

    const finalScan = await bugCheckpoint("every-cell-landed", async () => {
      const failedBatches = outcomes.filter(
        (outcome) =>
          outcome.error !== undefined ||
          outcome.status === undefined ||
          outcome.status < 200 ||
          outcome.status >= 300,
      );
      if (failedBatches.length > 0) {
        throw new Error(
          `${failedBatches.length} of ${outcomes.length} update batches failed: ${JSON.stringify(failedBatches)}`,
        );
      }
      // The endpoint silently drops record ids it does not recognize instead
      // of erroring, so "how many records the response echoed" catches skipped
      // rows one step earlier than the scan.
      const echoed = outcomes.reduce(
        (total, outcome) => total + (outcome.echoedRecords ?? 0),
        0,
      );
      if (echoed !== config.recordCount) {
        throw new Error(
          `Update batches echoed ${echoed} records, expected ${config.recordCount} — the server skipped rows`,
        );
      }

      const scan = await fullScan(tableId, config, 2);
      if (scan.mismatches.length > 0) {
        throw new Error(
          `${scan.mismatches.length} cell(s) did not land (${scan.rowsAtSeedRevision} row(s) still at the seed revision): ${scan.mismatches
            .slice(0, MAX_REPORTED_MISMATCHES)
            .join("; ")}`,
        );
      }
      if (scan.recordIds.length !== config.recordCount) {
        throw new Error(
          `Expected ${config.recordCount} records after update, got ${scan.recordIds.length}`,
        );
      }
      // Same ids in the same order proves the update happened in place rather
      // than delete-and-recreate; if the order drifted, the row-number-to-value
      // mapping above would not be trustworthy either.
      const drifted = scan.recordIds.findIndex(
        (id, index) => id !== seedScan.recordIds[index],
      );
      if (drifted !== -1) {
        throw new Error(
          `Record id order changed at row ${drifted + 1} — update was not in place`,
        );
      }
      return scan;
    });

    return {
      details: {
        tableId,
        tableName,
        recordCount: config.recordCount,
        batches: outcomes,
        scannedRecords: finalScan.recordIds.length,
      },
    };
  } finally {
    if (tableId) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        // Cleanup is the case's own housekeeping — the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
