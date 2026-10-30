import { FieldKeyType, FieldType } from "@teable/core";
import { uploadAttachment as apiUploadAttachment } from "@teable/openapi";
import {
  createBase,
  createField,
  createSpace,
  createTable,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  AttachmentReferenceCleanupCaseConfig,
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
} from "../types";
import { describeResponse, isSuccess, rawRequest, sleep } from "./raw-api";

// A fresh space holding two attachments of known, different sizes - one that
// is about to go, one that stays -> remove the first the way a person does
// (delete the field, clear the cell, delete the row, delete the table, delete
// the base), emptying the trash where there is one -> checkpoint: the space's
// attachment usage, calibrated once, counts only the attachment that stayed.
//
// Attachment usage is what a plan's storage limit is measured against.
// Permanently deleting an attachment field left its attachment references
// behind, so the deleted files went on counting against the space: people
// emptied the trash to make room and the number did not move. Each scenario
// here is another way an attachment leaves a space; all of them have to stop
// counting it.
//
// The space is the case's own, so no other attachment is in the total, and it
// is calibrated exactly once, after everything has happened: the first
// calibration of a space computes from scratch, while a later one within 30
// minutes returns the cached figure. A cached answer means something measured
// the space earlier, and the case stops as an error rather than judging it.

const NAME_FIELD = "Name";
const GONE_FIELD = "Gone";
const KEPT_FIELD = "Kept";

type TrashItem = {
  id: string;
  resourceId?: string;
  resourceIds?: string[];
  resourceType?: string;
};

export const runAttachmentReferenceCleanupCase = async (
  bugCase: BugCaseFor<"attachment-reference-cleanup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AttachmentReferenceCleanupCaseConfig = bugCase.config;
  if (
    config.goneBytes === config.keptBytes ||
    config.goneBytes < 1 ||
    config.keptBytes < 1
  ) {
    throw new Error(
      "the two attachments need different, non-zero sizes, or the total cannot say which one is counted",
    );
  }
  // Distinct content per run and per role, so the two never share a stored file.
  const content = (role: string, bytes: number) =>
    Buffer.from(
      `${role}-${context.runId}-`.padEnd(bytes, role[0]).slice(0, bytes),
    );

  let spaceId = "";
  try {
    spaceId = (
      await createSpace({ name: `${config.namePrefix}-${context.runId}` })
    ).id;

    const makeTable = async (baseId: string, name: string) =>
      createTable(baseId, {
        name,
        fields: [
          { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
          { name: GONE_FIELD, type: FieldType.Attachment },
          { name: KEPT_FIELD, type: FieldType.Attachment },
        ],
        records: [
          { fields: { [NAME_FIELD]: "row-1" } },
          { fields: { [NAME_FIELD]: "row-2" } },
        ],
      });
    const fieldIdOf = (
      table: { fields: { id: string; name: string }[] },
      name: string,
    ) => {
      const id = table.fields.find((field) => field.name === name)?.id;
      if (!id) {
        throw new Error(`no ${name} column`);
      }
      return id;
    };
    const upload = async (
      tableId: string,
      recordId: string,
      fieldId: string,
      role: "gone" | "kept",
    ) => {
      const bytes = role === "gone" ? config.goneBytes : config.keptBytes;
      const uploaded = await apiUploadAttachment(
        tableId,
        recordId,
        fieldId,
        content(role, bytes),
        {
          filename: `${role}-${context.runId}.txt`,
        },
      );
      assertServedByV2(uploaded.headers, {
        operation:
          "POST /table/{tableId}/record/{recordId}/{fieldId}/uploadAttachment",
      });
      const cell = uploaded.data.fields[fieldId] as
        | { size?: number }[]
        | undefined;
      if (cell?.[0]?.size !== bytes) {
        throw new Error(
          `the ${role} upload landed as ${JSON.stringify(cell)}, expected ${bytes} bytes`,
        );
      }
    };
    const waitForTrash = async (
      list: () => Promise<TrashItem[]>,
      matches: (item: TrashItem) => boolean,
      what: string,
    ) => {
      for (let attempt = 0; attempt < config.trashAttempts; attempt++) {
        const found = (await list()).find(matches);
        if (found) {
          return found;
        }
        await sleep(config.trashIntervalMs);
      }
      throw new Error(
        `${what} never appeared in the trash, so there is nothing to empty`,
      );
    };
    const tableTrash = (tableId: string) => async () =>
      (
        await rawRequest<{ trashItems?: TrashItem[] }>(
          "GET",
          `/trash/items?resourceId=${tableId}&resourceType=table`,
        )
      ).data.trashItems ?? [];
    const emptyTrash = async (
      resourceType: "table" | "base",
      resourceId: string,
    ) => {
      const reset = await rawRequest(
        "DELETE",
        `/trash/reset-items?resourceId=${resourceId}&resourceType=${resourceType}`,
      );
      if (!isSuccess(reset)) {
        throw new Error(
          `emptying the ${resourceType} trash answered ${describeResponse(reset)}`,
        );
      }
    };

    const baseId = (
      await createBase({ spaceId, name: `${config.namePrefix}-base` })
    ).id;
    const table = await makeTable(baseId, `${config.namePrefix}-table`);
    const [row1, row2] = table.records.map(
      (record: { id: string }) => record.id,
    );
    const goneId = fieldIdOf(table, GONE_FIELD);
    const keptId = fieldIdOf(table, KEPT_FIELD);

    // Where the attachment that goes and the one that stays live depends on
    // what is removed: the removed thing holds the first, a sibling the second.
    switch (config.scenario) {
      case "field-deleted": {
        await upload(table.id, row1, goneId, "gone");
        await upload(table.id, row1, keptId, "kept");
        const deleted = await rawRequest(
          "DELETE",
          `/table/${table.id}/field/${goneId}`,
        );
        if (!isSuccess(deleted)) {
          throw new Error(
            `deleting the field answered ${describeResponse(deleted)}`,
          );
        }
        await waitForTrash(
          tableTrash(table.id),
          (item) =>
            item.resourceType === "field" &&
            (item.resourceIds ?? []).includes(goneId),
          "the deleted field",
        );
        await emptyTrash("table", table.id);
        break;
      }
      case "cell-cleared": {
        await upload(table.id, row1, goneId, "gone");
        await upload(table.id, row1, keptId, "kept");
        const cleared = await rawRequest(
          "PATCH",
          `/table/${table.id}/record/${row1}`,
          {
            fieldKeyType: FieldKeyType.Id,
            record: { fields: { [goneId]: null } },
          },
        );
        if (!isSuccess(cleared)) {
          throw new Error(
            `clearing the cell answered ${describeResponse(cleared)}`,
          );
        }
        break;
      }
      case "record-deleted": {
        await upload(table.id, row1, goneId, "gone");
        await upload(table.id, row2, keptId, "kept");
        const deleted = await rawRequest(
          "DELETE",
          `/table/${table.id}/record/${row1}`,
        );
        if (!isSuccess(deleted)) {
          throw new Error(
            `deleting the row answered ${describeResponse(deleted)}`,
          );
        }
        await waitForTrash(
          tableTrash(table.id),
          (item) =>
            item.resourceType === "record" &&
            (item.resourceIds ?? []).includes(row1),
          "the deleted row",
        );
        await emptyTrash("table", table.id);
        break;
      }
      case "table-deleted": {
        const other = await makeTable(
          baseId,
          `${config.namePrefix}-kept-table`,
        );
        await upload(table.id, row1, goneId, "gone");
        await upload(
          other.id,
          other.records[0].id,
          fieldIdOf(other, KEPT_FIELD),
          "kept",
        );
        const deleted = await rawRequest(
          "DELETE",
          `/base/${baseId}/table/${table.id}`,
        );
        if (!isSuccess(deleted)) {
          throw new Error(
            `deleting the table answered ${describeResponse(deleted)}`,
          );
        }
        await waitForTrash(
          async () =>
            (
              await rawRequest<{ trashItems?: TrashItem[] }>(
                "GET",
                `/trash/items?resourceId=${baseId}&resourceType=base`,
              )
            ).data.trashItems ?? [],
          (item) =>
            item.resourceId === table.id ||
            (item.resourceIds ?? []).includes(table.id),
          "the deleted table",
        );
        await emptyTrash("base", baseId);
        break;
      }
      case "base-deleted": {
        const keptBaseId = (
          await createBase({ spaceId, name: `${config.namePrefix}-kept-base` })
        ).id;
        const other = await makeTable(
          keptBaseId,
          `${config.namePrefix}-kept-table`,
        );
        await upload(table.id, row1, goneId, "gone");
        await upload(
          other.id,
          other.records[0].id,
          fieldIdOf(other, KEPT_FIELD),
          "kept",
        );
        const deleted = await rawRequest("DELETE", `/base/${baseId}`);
        if (!isSuccess(deleted)) {
          throw new Error(
            `deleting the base answered ${describeResponse(deleted)}`,
          );
        }
        const item = await waitForTrash(
          async () =>
            (
              await rawRequest<{ trashItems?: TrashItem[] }>(
                "GET",
                `/trash?spaceId=${spaceId}&resourceType=base`,
              )
            ).data.trashItems ?? [],
          (candidate) => candidate.resourceId === baseId,
          "the deleted base",
        );
        const purged = await rawRequest("DELETE", `/trash/${item.id}`);
        if (!isSuccess(purged)) {
          throw new Error(
            `permanently deleting the base answered ${describeResponse(purged)}`,
          );
        }
        break;
      }
    }

    const calibrated = await rawRequest<{
      totalSize?: number;
      fromCache?: boolean;
    }>("POST", `/space/${spaceId}/billing/attachment-size/refresh`);
    if (
      !isSuccess(calibrated) ||
      typeof calibrated.data?.totalSize !== "number"
    ) {
      throw new Error(
        `calibrating the space's attachment usage answered ${describeResponse(calibrated)}`,
      );
    }
    if (calibrated.data.fromCache) {
      throw new Error(
        "the calibration returned a cached figure: something measured this fresh space before the removal, " +
          "so this reading cannot say whether the removed attachment stopped counting",
      );
    }
    const totalSize = calibrated.data.totalSize;

    const probe = await bugCheckpoint(
      "a-removed-attachment-stops-counting-against-the-space",
      async () => {
        if (totalSize !== config.keptBytes) {
          throw new Error(
            `after the ${config.scenario.replace("-", " ")} the space's attachment usage is ${totalSize} bytes, ` +
              `expected ${config.keptBytes} (only the attachment that stayed)` +
              (totalSize === config.keptBytes + config.goneBytes
                ? ` - the removed ${config.goneBytes}-byte attachment is still counted`
                : ""),
          );
        }
        return { totalSize };
      },
    );

    return { details: { spaceId, ...probe } };
  } finally {
    if (spaceId) {
      try {
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
