import { FieldType } from "@teable/core";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  GalleryPrimaryVisibleCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A gallery view with an attachment cover -> one column-meta update hiding
// both the primary column and another column -> checkpoint: the update is
// applied to the other column only; the primary column stays visible and the
// cover is untouched.
//
// A gallery card is titled by the row's primary column. Hiding it was
// accepted and stored, and a gallery whose primary column is hidden renders
// no cards at all - the whole view goes blank, with the rows still there and
// nothing saying why. The other column in the same request is the control:
// the batch must still apply, so a fix that refused the whole request would
// fail it.

const NAME_FIELD = "Name";
const NOTE_FIELD = "Note";
const COVER_FIELD = "Cover";

export const runGalleryPrimaryVisibleCase = async (
  bugCase: BugCaseFor<"gallery-primary-visible">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: GalleryPrimaryVisibleCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: [{ fields: { [NAME_FIELD]: "card-1", [NOTE_FIELD]: "note" } }],
    });
    tableIds.push(table.id);
    const [primary, note] = table.fields;
    const cover = await createField(table.id, {
      name: COVER_FIELD,
      type: FieldType.Attachment,
    });
    const created = await rawRequest<{ id?: string }>(
      "POST",
      `/table/${table.id}/view`,
      {
        name: "Gallery",
        type: "gallery",
        options: { coverFieldId: cover.id },
      },
    );
    const viewId = created.data?.id;
    if (!isSuccess(created) || !viewId) {
      throw new Error(
        `creating the gallery answered ${describeResponse(created)}`,
      );
    }
    const readView = async () =>
      (
        await rawRequest<{
          columnMeta: Record<string, { visible?: boolean }>;
          options?: { coverFieldId?: string };
        }>("GET", `/table/${table.id}/view/${viewId}`)
      ).data;

    const probe = await bugCheckpoint(
      "a-gallery-keeps-its-primary-column-visible",
      async () => {
        const updated = await rawRequest(
          "PUT",
          `/table/${table.id}/view/${viewId}/column-meta`,
          [
            { fieldId: primary.id, columnMeta: { visible: false } },
            { fieldId: note.id, columnMeta: { visible: false } },
          ],
        );
        if (!isSuccess(updated)) {
          throw new Error(
            `hiding two columns of the gallery answered ${describeResponse(updated)}`,
          );
        }
        const routing = assertServedByV2(updated.headers, {
          operation: "PUT /table/{tableId}/view/{viewId}/column-meta",
          feature: "updateViewColumnMeta",
        });
        const view = await readView();
        const state = {
          primaryVisible: view.columnMeta?.[primary.id]?.visible ?? null,
          noteVisible: view.columnMeta?.[note.id]?.visible ?? null,
          coverFieldId: view.options?.coverFieldId ?? null,
        };
        const problems: string[] = [];
        if (state.primaryVisible === false) {
          problems.push(
            "the primary column was hidden, so the gallery has no card titles to render",
          );
        }
        if (state.noteVisible !== false) {
          problems.push(
            `the other column in the same request was not hidden (${JSON.stringify(state.noteVisible)})`,
          );
        }
        if (state.coverFieldId !== cover.id) {
          problems.push(
            `the cover changed to ${JSON.stringify(state.coverFieldId)}`,
          );
        }
        if (problems.length > 0) {
          throw new Error(
            `${problems.join("; ")}. View state: ${JSON.stringify(state)}`,
          );
        }
        return { routing, state };
      },
    );

    return { details: { tableId: table.id, viewId, state: probe.state } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
