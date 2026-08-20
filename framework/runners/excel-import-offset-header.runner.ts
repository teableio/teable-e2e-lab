import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FieldKeyType } from "@teable/core";
import {
  analyzeFile as apiAnalyzeFile,
  getRecords as apiGetRecords,
  getSignature as apiGetSignature,
  importTableFromFile as apiImportTableFromFile,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  SUPPORTEDTYPE,
  UploadType,
} from "@teable/openapi";
import { read as xlsxRead, utils as xlsxUtils, write as xlsxWrite } from "xlsx";
import {
  createBase,
  createSpace,
  deleteSpace,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ExcelImportOffsetHeaderCaseConfig } from "../types";

// An Excel sheet whose used range starts below A1 -> analyze and import it ->
// checkpoint: the columns are the ones in the header row, and the data lands
// under them.
//
// The reader took the header row to be row index 0 of the sheet's dense row
// array. A used range that starts at A2 leaves index 0 empty, so the headers
// were read out of a hole: no columns at all, and the file looked like it held
// nothing.
//
// Sheets like this are ordinary rather than exotic. Anything exported with a
// title line, a blank spacer row, or a frozen banner above the table starts
// its used range below A1, and the file opens perfectly well in Excel - which
// is what makes "this file has no columns" so hard to argue with.
//
// The workbook is built and uploaded through the product's own attachment
// path, so nothing here reaches outside the machine.
//
// The case builds its own space rather than importing into the shared seed
// base: the EE import controller derives a row budget from the space's usage
// and answers 402 once it reaches zero, so importing into a space other cases
// have been filling would eventually fail for reasons unrelated to this bug.

const SHEET_NAME = "Sheet1";

export const runExcelImportOffsetHeaderCase = async (
  bugCase: BugCaseFor<"excel-import-offset-header">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ExcelImportOffsetHeaderCaseConfig = bugCase.config;
  const tmpPath = join(tmpdir(), `e2e-lab-offset-${context.runId}.xlsx`);
  let spaceId = "";

  if (config.headers.length !== config.row.length) {
    throw new Error(
      `the fixture declares ${config.headers.length} headers and ${config.row.length} data cells - they have to line up for the assertion to mean anything`,
    );
  }

  try {
    const space = await createSpace({
      name: `${config.namePrefix}-${context.runId}`,
    });
    spaceId = space.id;
    const base = await createBase({ spaceId });

    // Written at an origin below A1: that is the whole fixture. Built here
    // rather than checked in, because a binary in the repository would be
    // unreadable in review and the thing under test - where the header row
    // sits - should be legible in the case config.
    const worksheet = xlsxUtils.aoa_to_sheet([config.headers, config.row], {
      origin: config.origin,
    });
    // Writing at an origin places the cells there but leaves the used range
    // anchored at A1, which is not the file this case is about - a sheet
    // exported below a banner declares a range that starts where its content
    // does. So the range is set to exactly the two rows that were written.
    const start = xlsxUtils.decode_cell(config.origin);
    worksheet["!ref"] = xlsxUtils.encode_range({
      s: start,
      e: { r: start.r + 1, c: start.c + config.headers.length - 1 },
    });
    const workbook = xlsxUtils.book_new();
    xlsxUtils.book_append_sheet(workbook, worksheet, SHEET_NAME);
    const buffer = xlsxWrite(workbook, {
      type: "buffer",
      bookType: "xlsx",
    }) as Buffer;

    // Fixture verification, outside the checkpoint and before the file leaves
    // this process: the workbook really does start below A1. `origin` is a
    // request to the writer, not a guarantee, and a fixture that quietly wrote
    // its header at A1 would sail through both sides of the fix.
    const reread = xlsxRead(buffer, { type: "buffer" });
    const ref = reread.Sheets[SHEET_NAME]?.["!ref"];
    const firstRow = Number(/^[A-Z]+([0-9]+)/.exec(String(ref))?.[1] ?? 0);
    if (!ref || firstRow < 2) {
      throw new Error(
        `the workbook's used range is ${JSON.stringify(ref)} - it has to start below row 1 for this case to be about anything`,
      );
    }

    await writeFile(tmpPath, buffer);
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
      `e2e-lab-offset-${context.runId}.xlsx`,
    );
    const attachmentUrl = notified.data.presignedUrl;
    if (!attachmentUrl) {
      throw new Error("the uploaded workbook has no presigned URL");
    }

    const probe = await bugCheckpoint("header-below-a1-is-found", async () => {
      // The analyzer is inside the checkpoint on purpose: it is what fills the
      // import preview, and reporting no columns is the first thing the user
      // sees go wrong.
      const analyzed = await apiAnalyzeFile({
        attachmentUrl,
        fileType: SUPPORTEDTYPE.EXCEL,
      });
      const worksheetKey = Object.keys(analyzed.data.worksheets)[0];
      const columns = worksheetKey
        ? analyzed.data.worksheets[worksheetKey].columns
        : [];
      const columnNames = columns.map((column) => column.name);
      if (columnNames.join(" ") !== config.headers.join(" ")) {
        throw new Error(
          `the analyzer read ${JSON.stringify(columnNames)} from a sheet whose header row is ${JSON.stringify(config.headers)}`,
        );
      }

      const imported = await apiImportTableFromFile(base.id, {
        attachmentUrl,
        fileType: SUPPORTEDTYPE.EXCEL,
        worksheets: {
          [worksheetKey]: {
            name: `${config.namePrefix}-${context.runId}`,
            columns: columns.map((column, index) => ({
              ...column,
              sourceColumnIndex: index,
            })),
            useFirstRowAsHeader: true,
            importData: true,
          },
        },
        tz: config.timeZone,
      });
      const routing = assertServedByV2(imported.headers, {
        operation: "POST /import/{baseId}",
        feature: "importCsv",
      });

      const table = imported.data[0];
      if (!table?.id) {
        throw new Error(
          `the import created no table: ${JSON.stringify(imported.data)}`,
        );
      }
      const fieldNames = (table.fields ?? []).map(
        (field: { name?: string }) => field.name,
      );
      if (fieldNames.join(" ") !== config.headers.join(" ")) {
        throw new Error(
          `the imported table has fields ${JSON.stringify(fieldNames)}, expected the header row ${JSON.stringify(config.headers)}`,
        );
      }

      // And the row under the header has to have come with it. Columns without
      // their data would still leave the user with an empty table.
      const records = await apiGetRecords(table.id, {
        fieldKeyType: FieldKeyType.Name,
        take: 10,
      });
      if (records.data.records.length !== 1) {
        throw new Error(
          `the import landed ${records.data.records.length} rows, expected the single data row under the header`,
        );
      }
      const landed = config.headers.map((header) =>
        String(records.data.records[0].fields[header] ?? ""),
      );
      const expected = config.row.map((value) => String(value));
      if (landed.join(" ") !== expected.join(" ")) {
        throw new Error(
          `the imported row reads ${JSON.stringify(landed)}, expected ${JSON.stringify(expected)}`,
        );
      }
      return { tableId: table.id, columnNames, routing };
    });

    return {
      details: {
        spaceId,
        baseId: base.id,
        tableId: probe.tableId,
        origin: config.origin,
        usedRange: ref,
        columnNames: probe.columnNames,
        routing: probe.routing,
      },
    };
  } finally {
    await unlink(tmpPath).catch(() => undefined);
    if (spaceId) {
      try {
        // Trashing first is not optional: a permanent delete is a no-op on a
        // space that was never trashed, and the base would be left behind.
        await deleteSpace(spaceId);
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
  }
};
