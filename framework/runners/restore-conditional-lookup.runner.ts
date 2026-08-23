import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecords as apiGetRecords,
  getTrashItems as apiGetTrashItems,
  restoreTrash as apiRestoreTrash,
  ResourceType,
} from "@teable/openapi";
import {
  createField,
  createTable,
  deleteField,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RestoreConditionalLookupCaseConfig } from "../types";

// A lookup that matches rows by a value rather than through a link -> delete
// it -> restore it from the trash -> checkpoint: it comes back as the same
// field, condition included, still showing its values.
//
// A conditional lookup is how a table reads a value out of another table it
// has no link to: match on a shared reference - an external post id, an order
// number - and pull a column across. The condition is the whole field; without
// it there is nothing saying which row to read.
//
// Restoring one from the trash dropped it. What came back was not the field
// that was deleted, so the column that had been showing values went on
// showing nothing, and the only way back was to build the field again by hand
// and remember what the condition had been.
//
// Everything here is public API, the restore included, because the trash is
// something a person opens and clicks.

const SOURCE_REF_FIELD = "PostRef";
const SOURCE_VALUE_FIELD = "ThumbnailUrl";
const HOST_REF_FIELD = "ExternalPostRef";
const LOOKUP_FIELD = "PostThumbnail";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runRestoreConditionalLookupCase = async (
  bugCase: BugCaseFor<"restore-conditional-lookup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RestoreConditionalLookupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let sourceTableId = "";
  let hostTableId = "";

  if (config.rows.length < 2) {
    throw new Error(
      "at least two rows are needed - one row cannot show that the condition matched the right one",
    );
  }
  const refs = config.rows.map((row) => row.ref);
  if (new Set(refs).size !== refs.length) {
    throw new Error(
      "the reference values have to be distinct - the condition matches on them, and duplicates would " +
        "pass even if it matched the wrong row",
    );
  }

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        {
          name: SOURCE_REF_FIELD,
          type: FieldType.SingleLineText,
          isPrimary: true,
        },
        { name: SOURCE_VALUE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [SOURCE_REF_FIELD]: row.ref,
          [SOURCE_VALUE_FIELD]: row.value,
        },
      })),
    });
    sourceTableId = sourceTable.id;
    const sourceRefFieldId = sourceTable.fields.find(
      (field: { name: string }) => field.name === SOURCE_REF_FIELD,
    )?.id;
    const sourceValueFieldId = sourceTable.fields.find(
      (field: { name: string }) => field.name === SOURCE_VALUE_FIELD,
    )?.id;

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        {
          name: HOST_REF_FIELD,
          type: FieldType.SingleLineText,
          isPrimary: true,
        },
      ],
      records: config.rows.map((row) => ({
        fields: { [HOST_REF_FIELD]: row.ref },
      })),
    });
    hostTableId = hostTable.id;
    const hostRefFieldId = hostTable.fields.find(
      (field: { name: string }) => field.name === HOST_REF_FIELD,
    )?.id;
    if (!sourceRefFieldId || !sourceValueFieldId || !hostRefFieldId) {
      throw new Error("the fixture tables are not in place");
    }

    // No link field anywhere: the two tables are joined by the value in a
    // column, which is what makes this a conditional lookup rather than an
    // ordinary one.
    const lookupField = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      isConditionalLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: sourceValueFieldId,
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: sourceRefFieldId,
              operator: "is",
              value: { type: "field", fieldId: hostRefFieldId },
            },
          ],
        },
      },
    });

    const readLookup = async (fieldId: string) => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: config.rows.length,
      });
      return {
        headers: response.headers,
        values: response.data.records.map(
          (record: { fields: Record<string, unknown> }) => {
            const cell = record.fields[fieldId];
            return Array.isArray(cell)
              ? cell.map((entry) => String(entry)).join(",")
              : String(cell ?? "");
          },
        ),
      };
    };

    // Fixture verification, outside the checkpoint: the condition matched, and
    // each host row shows the value belonging to its own reference. Without
    // this, "the values did not come back" would be describing a field that
    // never showed any.
    const expected = config.rows.map((row) => row.value);
    const before = await readLookup(lookupField.id);
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (before.values.join("|") !== expected.join("|")) {
      throw new Error(
        `before the delete the lookup reads ${JSON.stringify(before.values)}, expected ` +
          `${JSON.stringify(expected)} - the fixture is not in place`,
      );
    }

    await deleteField(hostTableId, lookupField.id);

    // The trash entry is written asynchronously, so it is waited for outside
    // the checkpoint - a restore of nothing would fail for a reason that has
    // nothing to do with conditional lookups.
    let trashId = "";
    const trashDeadline = Date.now() + config.trashVisibleTimeoutMs;
    for (;;) {
      const items = await apiGetTrashItems({
        resourceId: hostTableId,
        resourceType: ResourceType.Table,
      });
      trashId = items.data.trashItems?.[0]?.id ?? "";
      if (trashId) {
        break;
      }
      if (Date.now() >= trashDeadline) {
        throw new Error(
          `the deleted field did not reach the trash within ${config.trashVisibleTimeoutMs}ms - ` +
            "there is nothing here to restore",
        );
      }
      await sleep(config.pollIntervalMs);
    }

    const probe = await bugCheckpoint(
      "restored-conditional-lookup-still-reads",
      async () => {
        await apiRestoreTrash(trashId, hostTableId);

        const fields = await getFields(hostTableId);
        const restored = fields.find(
          (field: { name: string }) => field.name === LOOKUP_FIELD,
        );
        if (!restored) {
          throw new Error(
            `restoring brought back ${JSON.stringify(fields.map((field: { name: string }) => field.name))} - ` +
              `"${LOOKUP_FIELD}" is not among them`,
          );
        }
        if (!restored.isLookup || !restored.isConditionalLookup) {
          throw new Error(
            `"${LOOKUP_FIELD}" came back as isLookup=${restored.isLookup} isConditionalLookup=` +
              `${restored.isConditionalLookup} - it is no longer the field that was deleted`,
          );
        }
        if (!restored.lookupOptions?.filter) {
          throw new Error(
            `"${LOOKUP_FIELD}" came back without its condition: ` +
              `${JSON.stringify(restored.lookupOptions ?? null)} - nothing says which row to read`,
          );
        }

        // The field being back is not the same as the column working. A
        // restore that kept the metadata and lost the values would leave the
        // user looking at an empty column.
        const after = await readLookup(restored.id);
        if (after.values.join("|") !== expected.join("|")) {
          throw new Error(
            `after the restore the lookup reads ${JSON.stringify(after.values)}, expected ` +
              `${JSON.stringify(expected)}`,
          );
        }
        return { restoredFieldId: restored.id, values: after.values };
      },
    );

    return {
      details: {
        sourceTableId,
        hostTableId,
        routing,
        deletedFieldId: lookupField.id,
        trashId,
        restoredFieldId: probe.restoredFieldId,
        valuesAfterRestore: probe.values,
      },
    };
  } finally {
    for (const tableId of [hostTableId, sourceTableId]) {
      if (!tableId) {
        continue;
      }
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
