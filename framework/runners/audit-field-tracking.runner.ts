import { FieldKeyType, FieldType } from "@teable/core";
import {
  createField,
  createTable,
  getField,
  getRecord,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  AuditFieldTrackingCaseConfig,
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
} from "../types";
import {
  describeResponse,
  dropTables,
  isSuccess,
  rawRequest,
  sleep,
} from "./raw-api";

// "Last modified" and "last modified by" columns can watch every column or a
// chosen few. An empty list means "every column". Three ways the stored list
// and the behaviour parted company, one scenario each:
//
//   - created-without-a-list: a column created without saying what to watch
//     stored no list at all, where it should store the empty one. A client
//     reading the settings back cannot tell "watches everything" from "never
//     configured", and an editor opening it has nothing to show.
//   - watched-column-deleted: the only watched column is deleted. The list
//     kept the deleted column's id, so the column watched nothing that still
//     exists and stopped moving for good - every later edit left it frozen.
//   - patched-back-to-everything: a PATCH setting the list back to empty
//     answered 200 and changed nothing, so the column kept watching the one
//     column it had been narrowed to.
//
// In the last two the edit that has to register is made to a column that was
// NOT watched before, a few seconds after the row was created, so a frozen
// value and an updated one are different instants.

const NAME_FIELD = "Name";
const WATCHED_FIELD = "Watched";
const OTHER_FIELD = "Other";
const MODIFIED_FIELD = "Modified";
const MODIFIER_FIELD = "Modified by";

const trackedIds = (options: unknown) =>
  (options as { trackedFieldIds?: unknown } | undefined)?.trackedFieldIds;

export const runAuditFieldTrackingCase = async (
  bugCase: BugCaseFor<"audit-field-tracking">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AuditFieldTrackingCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        // A primary column of its own: the watched one has to be deletable.
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: WATCHED_FIELD, type: FieldType.SingleLineText },
        { name: OTHER_FIELD, type: FieldType.SingleLineText },
      ],
      records: [],
    });
    tableIds.push(table.id);
    const nameId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id;
    const watchedId = table.fields.find(
      (field: { name: string }) => field.name === WATCHED_FIELD,
    )?.id;
    const otherId = table.fields.find(
      (field: { name: string }) => field.name === OTHER_FIELD,
    )?.id;
    if (!nameId || !watchedId || !otherId) {
      throw new Error(`table ${table.id} is not in place`);
    }

    if (config.scenario === "created-without-a-list") {
      const modified = await createField(table.id, {
        name: MODIFIED_FIELD,
        type: FieldType.LastModifiedTime,
      });
      const modifier = await createField(table.id, {
        name: MODIFIER_FIELD,
        type: FieldType.LastModifiedBy,
      });
      const probe = await bugCheckpoint(
        "a-new-audit-column-stores-that-it-watches-everything",
        async () => {
          const read = await rawRequest<
            Array<{ id: string; options?: unknown }>
          >("GET", `/table/${table.id}/field`);
          if (!isSuccess(read)) {
            throw new Error(
              `listing the columns answered ${describeResponse(read)}`,
            );
          }
          const routing = assertServedByV2(read.headers, {
            operation: "GET /table/{tableId}/field",
            feature: "getFields",
          });
          const lists = [modified, modifier].map((field) => ({
            name: field.name,
            trackedFieldIds: trackedIds(
              read.data.find((candidate) => candidate.id === field.id)?.options,
            ),
          }));
          const wrong = lists.filter(
            (list) => JSON.stringify(list.trackedFieldIds) !== "[]",
          );
          if (wrong.length > 0) {
            throw new Error(
              `created without a list, these columns do not store the empty one: ${JSON.stringify(wrong)}`,
            );
          }
          return { routing, lists };
        },
      );
      return { details: { tableId: table.id, lists: probe.lists } };
    }

    const modified = await createField(table.id, {
      name: MODIFIED_FIELD,
      type: FieldType.LastModifiedTime,
      options: { trackedFieldIds: [watchedId] },
    });
    const modifier = await createField(table.id, {
      name: MODIFIER_FIELD,
      type: FieldType.LastModifiedBy,
      options: { trackedFieldIds: [watchedId] },
    });
    const created = await rawRequest<{ records?: { id: string }[] }>(
      "POST",
      `/table/${table.id}/record`,
      {
        fieldKeyType: FieldKeyType.Id,
        records: [
          {
            fields: {
              [nameId]: config.rowTitle,
              [watchedId]: "watched",
              [otherId]: "before",
            },
          },
        ],
      },
    );
    const recordId = created.data?.records?.[0]?.id;
    if (!isSuccess(created) || !recordId) {
      throw new Error(`creating the row answered ${describeResponse(created)}`);
    }
    assertServedByV2(created.headers, {
      operation: "POST /table/{tableId}/record",
      feature: "createRecord",
    });

    const auditFields =
      config.scenario === "watched-column-deleted"
        ? [modified, modifier]
        : [modified];

    if (config.scenario === "watched-column-deleted") {
      const deleted = await rawRequest(
        "DELETE",
        `/table/${table.id}/field/${watchedId}`,
      );
      if (!isSuccess(deleted)) {
        throw new Error(
          `deleting the watched column answered ${describeResponse(deleted)}`,
        );
      }
      assertServedByV2(deleted.headers, {
        operation: "DELETE /table/{tableId}/field/{fieldId}",
        feature: "deleteField",
      });
    }

    const probe = await bugCheckpoint(
      config.scenario === "watched-column-deleted"
        ? "deleting-the-watched-column-falls-back-to-everything"
        : "patching-the-list-empty-watches-everything",
      async () => {
        if (config.scenario === "patched-back-to-everything") {
          const patched = await rawRequest(
            "PATCH",
            `/table/${table.id}/field/${modified.id}`,
            { options: { trackedFieldIds: [] } },
          );
          if (!isSuccess(patched)) {
            throw new Error(
              `patching the list empty answered ${describeResponse(patched)}`,
            );
          }
          assertServedByV2(patched.headers, {
            operation: "PATCH /table/{tableId}/field/{fieldId}",
            feature: "updateField",
          });
        }

        const lists = [];
        for (const field of auditFields) {
          const stored = trackedIds(
            (await getField(table.id, field.id)).options,
          );
          lists.push({ name: field.name, trackedFieldIds: stored });
        }
        const wrongLists = lists.filter(
          (list) => JSON.stringify(list.trackedFieldIds) !== "[]",
        );
        if (wrongLists.length > 0) {
          throw new Error(
            `the stored lists should be empty (watch everything) but read ${JSON.stringify(wrongLists)}`,
          );
        }

        // An edit to a column that was never watched has to register now.
        await sleep(config.editDelayMs);
        const editedAt = Date.now();
        await updateRecordByApi(table.id, recordId, otherId, "after");
        const row = await getRecord(table.id, recordId);
        const modifiedAt = Date.parse(String(row.fields[modified.id]));
        if (!Number.isFinite(modifiedAt) || modifiedAt < editedAt - 1_000) {
          throw new Error(
            `after editing ${OTHER_FIELD} at ${new Date(editedAt).toISOString()} the last-modified column reads ` +
              `${JSON.stringify(row.fields[modified.id] ?? null)} - it did not register the edit`,
          );
        }
        if (
          auditFields.includes(modifier) &&
          !(row.fields[modifier.id] as { id?: string } | undefined)?.id
        ) {
          throw new Error(
            `after the edit the last-modified-by column reads ${JSON.stringify(row.fields[modifier.id] ?? null)}`,
          );
        }
        return { lists, modified: row.fields[modified.id] };
      },
    );

    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
