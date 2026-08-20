import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { utils as xlsxUtils, write as xlsxWrite } from "xlsx";
import {
  analyzeFile as apiAnalyzeFile,
  getSignature as apiGetSignature,
  importTableFromFile as apiImportTableFromFile,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  SUPPORTEDTYPE,
  UploadType,
} from "@teable/openapi";
import {
  createBase,
  createSpace,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ExcelImportDuplicateColumnsCaseConfig } from "../types";

// An Excel sheet whose header row repeats a column name -> import it as a new
// table -> checkpoint: the table is created, and every column got a distinct
// physical name.
//
// `POST /api/import/:baseId` was already marked for v2, but the controller
// only let CSV through: Excel was pushed back with
// `v2Reason=unsupported_feature` and ran v1's createTableFromImport. v1 added
// the new table's columns in one batch without making the physical names
// unique, so a header row with two columns that normalise to the same
// identifier made Postgres answer 42701, `column already exists`. The import
// 500'd - five times across two users before it was traced (BACKEND-AI-1F5).
//
// Duplicate headers are not a corner case in spreadsheets. Two blank headers
// are duplicates; so is any pair that differs only in punctuation or case
// once it has been folded into a column identifier.
//
// The workbook is built and uploaded through the product's own attachment
// path, so nothing here reaches outside the machine: the file is written to a
// temp dir, signed, uploaded, and the presigned URL it comes back with is
// what the import reads.
//
// The case builds its own space rather than importing into the shared seed
// base. The EE import controller derives a row budget from the SPACE\'s usage
// (`limit - spaceTotalCount`) and answers 402 the moment it reaches zero, so
// importing into a space other cases have been filling would eventually fail
// for a reason that has nothing to do with duplicate headers. A fresh space
// carries its own quota and keeps the question answerable.

const SHEET_NAME = "Sheet1";

export const runExcelImportDuplicateColumnsCase = async (
  bugCase: BugCaseFor<"excel-import-duplicate-columns">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ExcelImportDuplicateColumnsCaseConfig = bugCase.config;
  const tmpPath = join(tmpdir(), `e2e-lab-import-${context.runId}.xlsx`);
  let spaceId = "";
  let baseId = "";

  const distinctHeaders = new Set(config.headers);
  if (distinctHeaders.size === config.headers.length) {
    throw new Error(
      `headers ${JSON.stringify(config.headers)} are all distinct - this case is about a header row that repeats a name`,
    );
  }

  try {
    const space = await createSpace({
      name: `${config.tableNamePrefix}-${context.runId}`,
    });
    spaceId = space.id;
    const base = await createBase({ spaceId });
    baseId = base.id;

    // Built here rather than checked in: a binary fixture in the repository
    // would be unreadable in review, and the thing under test is the header
    // row, which should be legible in the case config.
    const worksheet = xlsxUtils.aoa_to_sheet([config.headers, config.row]);
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, worksheet, SHEET_NAME);
    const buffer = xlsxWrite(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;
    await writeFile(tmpPath, buffer);

    // The product's own upload path, so the import reads the file the same way
    // it reads a user's.
    const signature = await apiGetSignature(
      {
        type: UploadType.Import,
        contentLength: buffer.byteLength,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      undefined,
    );
    await apiUploadFile(
      signature.data.token,
      createReadStream(tmpPath),
      signature.data.requestHeaders,
    );
    const notified = await apiNotify(
      signature.data.token,
      undefined,
      `e2e-lab-import-${context.runId}.xlsx`,
    );
    const attachmentUrl = notified.data.presignedUrl;
    if (!attachmentUrl) {
      throw new Error("the uploaded workbook has no presigned URL");
    }

    // Fixture verification, outside the checkpoint: the analyzer sees the
    // sheet and reports as many columns as the header row has. If it collapsed
    // the duplicates here, the import below would never be asked the question
    // this case exists for.
    const analyzed = await apiAnalyzeFile({
      attachmentUrl,
      fileType: SUPPORTEDTYPE.EXCEL,
    });
    const worksheetKey = Object.keys(analyzed.data.worksheets)[0];
    const analyzedColumns = worksheetKey
      ? analyzed.data.worksheets[worksheetKey].columns
      : [];
    if (analyzedColumns.length !== config.headers.length) {
      throw new Error(
        `the analyzer reported ${analyzedColumns.length} columns for a header row of ${config.headers.length} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "duplicate-headers-import-without-colliding",
      async () => {
        const imported = await apiImportTableFromFile(baseId, {
          attachmentUrl,
          fileType: SUPPORTEDTYPE.EXCEL,
          worksheets: {
            [worksheetKey]: {
              name: `${config.tableNamePrefix}-${context.runId}`,
              columns: analyzedColumns.map((column, index) => ({
                ...column,
                sourceColumnIndex: index,
              })),
              useFirstRowAsHeader: true,
              importData: true,
            },
          },
          tz: config.timeZone,
        });

        // The engine belongs to this request: routing Excel to v2 IS the fix,
        // so an import served by v1 is the bug rather than a harness problem.
        // Asserting it here means a v1 answer reads as a reproduction - the
        // conservative direction, never a false green.
        const routing = assertServedByV2(imported.headers, {
          operation: "POST /import/{baseId}",
          feature: "importCsv",
        });
        if (routing.reason === "unsupported_feature") {
          throw new Error(
            "the Excel import was refused by v2 as an unsupported feature and fell back to v1",
          );
        }

        const table = imported.data[0];
        if (!table?.id) {
          throw new Error(
            `the import created no table: ${JSON.stringify(imported.data)}`,
          );
        }

        // Every column has to have landed with a distinct physical name -
        // that is precisely what 42701 was telling us had not happened.
        const dbFieldNames = (table.fields ?? []).map(
          (field: { dbFieldName?: string }) => field.dbFieldName,
        );
        const distinct = new Set(dbFieldNames);
        if (distinct.size !== dbFieldNames.length) {
          throw new Error(
            `the imported table reuses physical column names: ${JSON.stringify(dbFieldNames)}`,
          );
        }
        if (dbFieldNames.length < config.headers.length) {
          throw new Error(
            `the import kept ${dbFieldNames.length} of ${config.headers.length} columns: ${JSON.stringify(dbFieldNames)}`,
          );
        }
        return { tableId: table.id, dbFieldNames, routing };
      },
    );

    return {
      details: {
        tableId: probe.tableId,
        headers: config.headers,
        dbFieldNames: probe.dbFieldNames,
        routing: probe.routing,
      },
    };
  } finally {
    if (spaceId) {
      try {
        // The space carries the base, the imported table and its rows, so one
        // delete takes the whole fixture with it.
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    try {
      await unlink(tmpPath);
    } catch {
      // The workbook is a scratch file; failing to remove it is not a result.
    }
  }
};
