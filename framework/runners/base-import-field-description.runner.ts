import { createReadStream } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FieldType } from "@teable/core";
import {
  axios,
  exportBase as apiExportBase,
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
  getFields,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { BaseImportFieldDescriptionCaseConfig } from "../types";

// A base whose fields carry descriptions -> export it and import it back ->
// checkpoint: the copy's fields still carry them.
//
// Exporting and importing a base is how a base moves: onto another instance,
// into a customer's space, out of a template. A field's description is the
// instruction the person filling the row reads - what counts as done, which
// currency, whose name goes here. Losing it costs nothing at import time and
// shows up much later, as rows filled in wrong by people who had no way to
// know the rule.
//
// It is also invisible on arrival. Every column is there, every row is there,
// and the descriptions are one hover away from where anyone would look.

const NAME_FIELD = "Name";

export const runBaseImportFieldDescriptionCase = async (
  bugCase: BugCaseFor<"base-import-field-description">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: BaseImportFieldDescriptionCaseConfig = bugCase.config;
  const suffix = `${config.namePrefix}-${context.runId}`;
  const zipPath = join(tmpdir(), `e2e-lab-base-desc-${context.runId}.zip`);
  let spaceId = "";

  if (config.describedFields.length < 1) {
    throw new Error("the fixture needs at least one described field");
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
        ...config.describedFields.map((field) => ({
          name: field.name,
          type: FieldType.SingleLineText,
          description: field.description,
        })),
        // One field deliberately without a description, so "every field came
        // back with a description" cannot be reached by inventing one.
        { name: config.undescribedFieldName, type: FieldType.SingleLineText },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });

    // Fixture verification, outside the checkpoint: the descriptions are on
    // the source. If creating a field silently dropped them, every commit
    // would answer the same way.
    const sourceFields = await getFields(table.id);
    for (const field of config.describedFields) {
      const stored = sourceFields.find(
        (candidate: { name: string }) => candidate.name === field.name,
      )?.description;
      if (stored !== field.description) {
        throw new Error(
          `the source field ${field.name} holds ${JSON.stringify(stored)} as its description, expected ` +
            `${JSON.stringify(field.description)} - the fixture is not in place`,
        );
      }
    }

    const exported = await apiExportBase(sourceBase.id, { includeData: true });
    const previewUrl = (exported.data as unknown as { previewUrl?: string })
      ?.previewUrl;
    if (!previewUrl) {
      throw new Error(
        `exporting ${sourceBase.id} returned no file: ${JSON.stringify(exported.data)}`,
      );
    }
    // The preview URL comes back absolute or rooted at the app depending on
    // the storage provider; resolving against the app URL covers both.
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
      `e2e-lab-base-desc-${context.runId}.zip`,
    );

    const probe = await bugCheckpoint(
      "an-imported-base-keeps-its-field-descriptions",
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

        const importedFields = await getFields(importedTableId);
        const descriptionOf = (name: string) =>
          importedFields.find((field: { name: string }) => field.name === name)
            ?.description;

        const missing = config.describedFields.filter(
          (field) => descriptionOf(field.name) !== field.description,
        );
        const invented = descriptionOf(config.undescribedFieldName);
        if (missing.length > 0 || (invented ?? null) !== null) {
          throw new Error(
            `the imported copy holds ${JSON.stringify(
              Object.fromEntries(
                [
                  ...config.describedFields.map((field) => field.name),
                  config.undescribedFieldName,
                ].map((name) => [name, descriptionOf(name) ?? null]),
              ),
            )}` +
              (missing.length > 0
                ? ` - ${missing.length} of ${config.describedFields.length} descriptions did not survive the ` +
                  "import, and the copy looks complete without them"
                : ` - the field that had no description came back with ${JSON.stringify(invented)}`),
          );
        }
        return { importedTableId };
      },
    );

    return {
      details: {
        sourceTableId: table.id,
        importedTableId: probe.importedTableId,
        describedFields: config.describedFields.length,
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
