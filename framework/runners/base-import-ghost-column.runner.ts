import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  exportBase as apiExportBase,
  getRecords as apiGetRecords,
  getSignature as apiGetSignature,
  importBase as apiImportBase,
  notify as apiNotify,
  uploadFile as apiUploadFile,
  UploadType,
} from "@teable/openapi";
import {
  createBase,
  createSpace,
  createTable,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { BaseImportGhostColumnCaseConfig } from "../types";

// A table carrying a column left behind by a deleted one -> export the base
// and import it back -> checkpoint: every row is in the copy.
//
// Exporting and importing a base is how a base moves: onto another instance,
// into a customer's space, out of a template. What travels is a dump of the
// table as it is stored, and a table stored for a while has been edited:
// columns were added, renamed, removed. A removed column can leave its storage
// behind, invisible to everyone, and a base that has been lived in for a year
// is the one most likely to have one.
//
// Rows were lost on the way back in. Not all of them and not with an error -
// the import reports success, the tables are there, the columns are there, and
// the count is short. Nobody counts rows after a migration; they open the base
// and it looks like their base.
//
// The leftover column is made with SQL, because no request produces one - and
// a table that never had one cannot show the difference.

const NAME_FIELD = "Name";
const NOTE_FIELD = "Note";

export const runBaseImportGhostColumnCase = async (
  bugCase: BugCaseFor<"base-import-ghost-column">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: BaseImportGhostColumnCaseConfig = bugCase.config;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const zipPath = join(tmpdir(), `e2e-lab-ghost-column-${context.runId}.zip`);
  let spaceId = "";

  if (config.rowNames.length < 2) {
    throw new Error(
      "two rows at least - with one, losing every row and losing some rows look the same",
    );
  }

  try {
    // Its own space: importing a base creates one, and the seed base's space
    // is shared with every other case in the run.
    const space = await createSpace({ name: suffix });
    spaceId = space.id;
    const sourceBase = await createBase({ spaceId, name: `${suffix}-source` });

    const table = await createTable(sourceBase.id, {
      name: `${suffix}-table`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rowNames.map((name, index) => ({
        fields: { [NAME_FIELD]: name, [NOTE_FIELD]: `note-${index}` },
      })),
    });

    // Setup: the storage a removed column leaves behind - a column in the
    // table that no column in the interface points at.
    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(table.id);
    await db.execute(
      `ALTER TABLE "${physical.schema}"."${physical.table}" ADD COLUMN "${config.ghostColumnName}" text`,
    );

    // Fixture verification, outside the checkpoint: the leftover column is
    // invisible from the interface and every row is still readable. If it
    // showed up as a column, this would be a different case; if the rows had
    // already gone, the checkpoint would be watching the wrong loss.
    const before = await apiGetRecords(table.id, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rowNames.length + 5,
    });
    const beforeNames = before.data.records
      .map((record: { fields: Record<string, unknown> }) =>
        String(record.fields[NAME_FIELD]),
      )
      .sort();
    if (beforeNames.join(" ") !== [...config.rowNames].sort().join(" ")) {
      throw new Error(
        `the source table holds [${beforeNames.join(", ")}], expected [${[...config.rowNames].sort().join(", ")}] - the fixture is not in place`,
      );
    }
    if (
      before.data.records.some((record: { fields: Record<string, unknown> }) =>
        Object.keys(record.fields).includes(config.ghostColumnName),
      )
    ) {
      throw new Error(
        `the leftover column ${JSON.stringify(config.ghostColumnName)} is visible from the interface - it is a column, not a leftover`,
      );
    }

    const exported = await apiExportBase(sourceBase.id, { includeData: true });
    const previewUrl = (exported.data as unknown as { previewUrl?: string })
      ?.previewUrl;
    if (!previewUrl) {
      throw new Error(
        `exporting ${sourceBase.id} returned no file: ${JSON.stringify(exported.data)}`,
      );
    }
    const downloadUrl = /^https?:\/\//.test(previewUrl)
      ? previewUrl
      : new URL(previewUrl, context.appUrl).toString();
    const downloaded = await axios.get<ArrayBuffer>(downloadUrl, {
      responseType: "arraybuffer",
      baseURL: "",
      headers: context.cookie ? { Cookie: context.cookie } : undefined,
    });
    const zip = Buffer.from(downloaded.data);
    if (zip.byteLength === 0) {
      throw new Error("the exported base file is empty");
    }
    await writeFile(zipPath, zip);

    const signature = await apiGetSignature(
      {
        type: UploadType.Import,
        contentLength: zip.byteLength,
        contentType: "application/zip",
      },
      undefined,
    );
    await apiUploadFile(
      signature.data.token,
      createReadStream(zipPath),
      signature.data.requestHeaders,
    );
    const notified = await apiNotify(
      signature.data.token,
      undefined,
      `e2e-lab-ghost-column-${context.runId}.zip`,
    );

    const probe = await bugCheckpoint(
      "every-row-survives-a-base-round-trip",
      async () => {
        const imported = await apiImportBase({
          notify: notified.data,
          spaceId,
        });
        const importedTableId = imported.data?.tableIdMap?.[table.id];
        if (!importedTableId) {
          throw new Error(
            `importing the base produced no copy of ${table.id}: ${JSON.stringify(imported.data)}`,
          );
        }

        // The import reports success before the rows have all landed, so the
        // count is waited on rather than read once - otherwise slow would read
        // as lost.
        let names: string[] = [];
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          const copied = await apiGetRecords(importedTableId, {
            fieldKeyType: FieldKeyType.Name,
            take: config.rowNames.length + 5,
          });
          names = copied.data.records
            .map((record: { fields: Record<string, unknown> }) =>
              String(record.fields[NAME_FIELD]),
            )
            .sort();
          if (names.length >= config.rowNames.length) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }
        const expected = [...config.rowNames].sort();
        if (names.join(" ") !== expected.join(" ")) {
          const lost = expected.filter((name) => !names.includes(name));
          throw new Error(
            `the imported copy holds [${names.join(", ")}], expected [${expected.join(", ")}] - ` +
              `${lost.length} of ${expected.length} rows did not come back, and the import reported success`,
          );
        }
        return { importedTableId, names };
      },
    );

    return {
      details: {
        sourceBaseId: sourceBase.id,
        sourceTableId: table.id,
        ghostColumnName: config.ghostColumnName,
        importedTableId: probe.importedTableId,
        rowsInCopy: probe.names.length,
      },
    };
  } finally {
    try {
      await unlink(zipPath);
    } catch {
      // The file may never have been written; nothing to clean up.
    }
    if (spaceId) {
      try {
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
