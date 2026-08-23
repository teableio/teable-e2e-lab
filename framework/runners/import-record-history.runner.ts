import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FieldKeyType, FieldType } from "@teable/core";
import {
  analyzeFile as apiAnalyzeFile,
  getRecordListHistory as apiGetRecordListHistory,
  getSignature as apiGetSignature,
  inplaceImportTableFromFile as apiInplaceImport,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  SUPPORTEDTYPE,
  UploadType,
} from "@teable/openapi";
import {
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ImportRecordHistoryCaseConfig } from "../types";

// Import a sheet into a table -> checkpoint: the table's record history is as
// empty as it was before.
//
// Record history is the "who changed this cell, and from what" trail. Creating
// a record through the product writes none of it - a new row has no previous
// value to record - and importing is creating rows.
//
// The import wrote one history row per non-empty cell anyway, each of them a
// null-to-value entry. On a sheet of any size that is rows times columns of
// write amplification: a 10000 x 20 import is 200000 history rows nobody asked
// for, slowing the import that produces them and padding the history a person
// later scrolls through.
//
// The control is the same table's own record creation, checked first. It
// establishes that history is not being written for ordinary creates on this
// commit either - without it, "the import wrote nothing" could just as well
// mean history is switched off here entirely.

const NAME_FIELD = "Name";
const NOTE_FIELD = "Note";

export const runImportRecordHistoryCase = async (
  bugCase: BugCaseFor<"import-record-history">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ImportRecordHistoryCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const csvPath = join(tmpdir(), `e2e-lab-import-history-${context.runId}.csv`);
  let tableId = "";

  if (config.importedRows < 2) {
    throw new Error(
      "at least two imported rows - one row times two columns is a count that could be reached by accident",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: [],
    });
    tableId = table.id;
    const nameFieldId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id;
    const noteFieldId = table.fields.find(
      (field: { name: string }) => field.name === NOTE_FIELD,
    )?.id;
    if (!nameFieldId || !noteFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const historyCount = async () => {
      // The query takes no page size - a cursor and some filters is all it
      // offers - so this is the first page. That is enough: the assertion is
      // that the list is empty, and one entry on the first page is one too
      // many.
      const response = await apiGetRecordListHistory(tableId, {});
      return {
        headers: response.headers,
        count: (response.data.historyList ?? []).length,
      };
    };

    // Control, outside the checkpoint: creating rows through the product
    // writes no history. If it did on this commit, the assertion below would
    // be measuring something else entirely.
    await createRecords(tableId, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [nameFieldId]: "created-through-the-api",
            [noteFieldId]: "a note",
          },
        },
      ],
    });
    const afterCreate = await historyCount();
    if (afterCreate.count !== 0) {
      throw new Error(
        `creating one row wrote ${afterCreate.count} history entries on this commit - ordinary creates are ` +
          "supposed to write none, so this case cannot say anything about the import",
      );
    }

    // The sheet: two columns, several rows, every cell filled. Empty cells
    // were never the problem - the amplification is one entry per non-empty
    // cell - so a sparse sheet would understate it.
    const header = `${NAME_FIELD},${NOTE_FIELD}\n`;
    const body = Array.from(
      { length: config.importedRows },
      (_, index) => `imported-${index},note-${index}`,
    ).join("\n");
    const csv = `${header}${body}\n`;
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
      `e2e-lab-import-history-${context.runId}.csv`,
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

    const imported = await apiInplaceImport(baseId, tableId, {
      attachmentUrl,
      fileType: SUPPORTEDTYPE.CSV,
      insertConfig: {
        sourceWorkSheetKey: worksheetKey,
        excludeFirstRow: true,
        sourceColumnMap: { [nameFieldId]: 0, [noteFieldId]: 1 },
      },
    });
    const routing = assertServedByV2(imported.headers, {
      operation: "PATCH /import/{baseId}/{tableId}",
      feature: "importRecords",
    });

    const probe = await bugCheckpoint(
      "import-writes-no-record-history",
      async () => {
        // The import answers before its rows are all in, and history is written
        // by a projection behind it, so this is a wait rather than one read: a
        // check that fired too early would pass on a commit that writes plenty.
        const deadline = Date.now() + config.settleTimeoutMs;
        let count = 0;
        for (;;) {
          count = (await historyCount()).count;
          if (count > 0) {
            throw new Error(
              `importing ${config.importedRows} rows of 2 columns wrote ${count} record history entries - ` +
                "creating the same rows through the product writes none",
            );
          }
          if (Date.now() >= deadline) {
            return { count };
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }
      },
    );

    return {
      details: {
        tableId,
        importedRows: config.importedRows,
        routing,
        historyAfterImport: probe.count,
        watchedForMs: config.settleTimeoutMs,
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
