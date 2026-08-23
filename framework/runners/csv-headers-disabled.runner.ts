import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FieldKeyType, FieldType } from "@teable/core";
import {
  analyzeFile as apiAnalyzeFile,
  getRecords as apiGetRecords,
  getSignature as apiGetSignature,
  inplaceImportTableFromFile as apiInplaceImport,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  SUPPORTEDTYPE,
  UploadType,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CsvHeadersDisabledCaseConfig } from "../types";

// Import a sheet whose first line is data, not a header -> checkpoint: every
// line lands.
//
// A sheet does not always carry a header. An export from another system, a
// paste into a text file, a log someone saved - the first line is a record
// like any other, and the import dialog has a switch that says so.
//
// With that switch off, the first line was dropped anyway. One row missing out
// of a hundred is the kind of loss nobody counts: the import reports success,
// the table looks full, and the row that is gone is the one at the top.

const FIRST_COLUMN = "Ref";
const SECOND_COLUMN = "Note";

export const runCsvHeadersDisabledCase = async (
  bugCase: BugCaseFor<"csv-headers-disabled">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CsvHeadersDisabledCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const csvPath = join(tmpdir(), `e2e-lab-csv-headers-${context.runId}.csv`);
  let tableId = "";

  if (config.rows.length < 2) {
    throw new Error(
      "at least two lines - with one, a dropped first line and an import that did nothing look the same",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: FIRST_COLUMN, type: FieldType.SingleLineText, isPrimary: true },
        { name: SECOND_COLUMN, type: FieldType.SingleLineText },
      ],
      records: [],
    });
    tableId = table.id;
    const firstFieldId = table.fields.find(
      (field: { name: string }) => field.name === FIRST_COLUMN,
    )?.id;
    const secondFieldId = table.fields.find(
      (field: { name: string }) => field.name === SECOND_COLUMN,
    )?.id;
    if (!firstFieldId || !secondFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // No header line: every line is a record, which is what the switch in the
    // dialog is for.
    const csv = `${config.rows.map((row) => `${row.ref},${row.note}`).join("\n")}\n`;
    await writeFile(csvPath, csv, "utf8");
    const signature = await apiGetSignature(
      {
        type: UploadType.Import,
        contentLength: Buffer.byteLength(csv),
        contentType: "text/csv",
      },
      undefined,
    );
    await apiUploadFile(
      signature.data.token,
      createReadStream(csvPath),
      signature.data.requestHeaders,
    );
    const notified = await apiNotify(
      signature.data.token,
      undefined,
      `e2e-lab-csv-headers-${context.runId}.csv`,
    );
    const attachmentUrl = notified.data.presignedUrl;
    if (!attachmentUrl) {
      throw new Error("the uploaded sheet has no presigned URL");
    }
    const analyzed = await apiAnalyzeFile({
      attachmentUrl,
      fileType: SUPPORTEDTYPE.CSV,
    });
    const worksheetKey = Object.keys(analyzed.data.worksheets)[0];
    if (!worksheetKey) {
      throw new Error("the analyzer found no worksheet in the uploaded CSV");
    }

    const probe = await bugCheckpoint(
      "a-headerless-sheet-imports-every-line",
      async () => {
        const imported = await apiInplaceImport(baseId, tableId, {
          attachmentUrl,
          fileType: SUPPORTEDTYPE.CSV,
          insertConfig: {
            sourceWorkSheetKey: worksheetKey,
            // The switch: the first line is a record, not a header.
            excludeFirstRow: false,
            sourceColumnMap: { [firstFieldId]: 0, [secondFieldId]: 1 },
          },
        });
        const routing = assertServedByV2(imported.headers, {
          operation: "PATCH /import/{baseId}/{tableId}",
          feature: "importRecords",
        });

        const after = await apiGetRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.rows.length + 5,
        });
        const landed = after.data.records.map(
          (record: { fields: Record<string, unknown> }) => ({
            ref: String(record.fields[FIRST_COLUMN] ?? ""),
            note: String(record.fields[SECOND_COLUMN] ?? ""),
          }),
        );
        const missing = config.rows.filter(
          (row) =>
            !landed.some(
              (entry) => entry.ref === row.ref && entry.note === row.note,
            ),
        );
        if (missing.length > 0) {
          throw new Error(
            `${missing.length} of ${config.rows.length} lines did not land: ` +
              `${JSON.stringify(missing)} - the sheet has no header row, so every line is a record` +
              (missing.length === 1 && missing[0].ref === config.rows[0].ref
                ? ", and the one that is gone is the first"
                : ""),
          );
        }
        if (landed.length !== config.rows.length) {
          throw new Error(
            `the table holds ${landed.length} rows for ${config.rows.length} lines: ${JSON.stringify(landed)}`,
          );
        }
        return { routing, landed };
      },
    );

    return {
      details: {
        tableId,
        lines: config.rows.length,
        routing: probe.routing,
        landed: probe.landed,
      },
    };
  } finally {
    await unlink(csvPath).catch(() => undefined);
    if (tableId) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
