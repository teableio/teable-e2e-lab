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
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AppendImportComputedCaseConfig } from "../types";

// A table with a worked-out column -> add rows to it from a file ->
// checkpoint: the new rows have that column worked out too.
//
// Importing into a table that already exists is how a month's data arrives:
// the table is set up, the columns that work things out are set up, and the
// rows come in from a spreadsheet. Nothing told those columns that new rows
// had arrived, so the imported rows carried the values from the file and
// nothing else.
//
// A blank in a worked-out column reads as "nothing to work out here", not as
// "this was never calculated". Sums and counts over that column are quietly
// short by exactly the rows that were imported, which is the part of the table
// nobody re-checks.
//
// The row that was in the table before the import is the control: it holds its
// worked-out value throughout, so "the column is empty everywhere" is told
// apart from "the imported rows were skipped".

const REF_COLUMN = "Ref";
const AMOUNT_COLUMN = "Amount";
const DERIVED_COLUMN = "Amount with tax";

export const runAppendImportComputedCase = async (
  bugCase: BugCaseFor<"append-import-computed">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AppendImportComputedCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const csvPath = join(tmpdir(), `e2e-lab-append-import-${context.runId}.csv`);
  let tableId = "";

  if (config.importedRows.length < 2) {
    throw new Error(
      "at least two imported rows - with one, a skipped row and a failed import look the same",
    );
  }

  // Whole numbers only: the product stores what the arithmetic gives, and a
  // fractional multiplier makes that 110.00000000000001 rather than 110 - run
  // 32687675515 failed its own fixture check on exactly that.
  if (!Number.isInteger(config.multiplier)) {
    throw new Error(
      "the multiplier has to be a whole number, or the expected value and the stored one differ in the " +
        "last decimal place for reasons that have nothing to do with the import",
    );
  }
  const derived = (amount: number) => amount * config.multiplier;

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: REF_COLUMN, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_COLUMN, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [REF_COLUMN]: config.existingRow.ref,
            [AMOUNT_COLUMN]: config.existingRow.amount,
          },
        },
      ],
    });
    tableId = table.id;
    const refFieldId = table.fields.find(
      (field: { name: string }) => field.name === REF_COLUMN,
    )?.id;
    const amountFieldId = table.fields.find(
      (field: { name: string }) => field.name === AMOUNT_COLUMN,
    )?.id;
    if (!refFieldId || !amountFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    await createField(tableId, {
      name: DERIVED_COLUMN,
      type: FieldType.Formula,
      options: { expression: `{${amountFieldId}} * ${config.multiplier}` },
    });

    const readDerived = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.importedRows.length + 1,
      });
      return Object.fromEntries(
        read.data.records.map((record: { fields: Record<string, unknown> }) => [
          String(record.fields[REF_COLUMN] ?? ""),
          record.fields[DERIVED_COLUMN] ?? null,
        ]),
      ) as Record<string, unknown>;
    };

    // Fixture verification, outside the checkpoint: the column works things
    // out for the row that is already there. If it did not, an empty column
    // after the import would mean nothing.
    const before = await readDerived();
    if (before[config.existingRow.ref] !== derived(config.existingRow.amount)) {
      throw new Error(
        `the row that was already here reads ${JSON.stringify(before[config.existingRow.ref])} in ` +
          `${DERIVED_COLUMN}, expected ${derived(config.existingRow.amount)} - the fixture is not in place`,
      );
    }

    const csv =
      `${REF_COLUMN},${AMOUNT_COLUMN}\n` +
      `${config.importedRows.map((row) => `${row.ref},${row.amount}`).join("\n")}\n`;
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
      `e2e-lab-append-import-${context.runId}.csv`,
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
      "imported-rows-get-their-worked-out-column",
      async () => {
        await apiInplaceImport(baseId, tableId, {
          attachmentUrl,
          fileType: SUPPORTEDTYPE.CSV,
          insertConfig: {
            sourceWorkSheetKey: worksheetKey,
            excludeFirstRow: true,
            sourceColumnMap: { [refFieldId]: 0, [amountFieldId]: 1 },
          },
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let seen: Record<string, unknown> = {};
        for (;;) {
          seen = await readDerived();
          const allThere = config.importedRows.every(
            (row) => seen[row.ref] === derived(row.amount),
          );
          if (allThere) {
            break;
          }
          if (Date.now() >= deadline) {
            const missing = config.importedRows.filter(
              (row) => seen[row.ref] !== derived(row.amount),
            );
            throw new Error(
              `after ${config.settleTimeoutMs}ms ${DERIVED_COLUMN} reads ${JSON.stringify(seen)} - ` +
                `${missing.length} of ${config.importedRows.length} imported rows have nothing worked out, ` +
                "which reads as nothing to work out and leaves every total over the column short",
            );
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }

        // The control: the row that was here before still holds its value.
        if (
          seen[config.existingRow.ref] !== derived(config.existingRow.amount)
        ) {
          throw new Error(
            `the import also changed the row that was already here: ${JSON.stringify(seen)}`,
          );
        }
        return { seen };
      },
    );

    return {
      details: { tableId, derivedAfterImport: probe.seen },
    };
  } finally {
    try {
      await unlink(csvPath);
    } catch {
      // The file may never have been written; nothing to clean up.
    }
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
