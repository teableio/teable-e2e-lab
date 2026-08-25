import { FieldKeyType, FieldType } from "@teable/core";
import {
  archiveRecords as apiArchiveRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ArchiveRecountCaseConfig } from "../types";

// A column that counts the rows matching a condition -> archive every row it
// was counting -> checkpoint: the count comes down.
//
// Archiving is how a team puts finished work away without losing it. The rows
// leave the table; the point of archiving rather than deleting is that they
// can be read back later.
//
// The counts that were counting them did not come down. A column reading "3
// open items" over a table with no open items left is not a stale number
// somebody will notice and refresh: it is the number the team plans around,
// and it is the only place they look. Nothing on screen suggests the count and
// the rows disagree.
//
// The counting column counts by a condition rather than by a link, which is
// why the case is built that way: the same archive already brought linked
// counts down, and the shape that did not is the one where the two tables are
// connected by matching values instead.

const NAME_FIELD = "Name";
const VALUE_FIELD = "Value";
const OWNER_FIELD = "Owner";
const COUNT_FIELD = "Open items";

export const runArchiveRecountCase = async (
  bugCase: BugCaseFor<"archive-recount">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ArchiveRecountCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.owners.length < 2) {
    throw new Error(
      "two owners at least - with one, a count that went to zero everywhere and a count that followed the condition look the same",
    );
  }

  try {
    // The table carrying the counts, one row per owner.
    const stats = await createTable(baseId, {
      name: `${suffix}-stats`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.owners.map((owner) => ({
        fields: { [NAME_FIELD]: owner },
      })),
    });
    createdTableIds.unshift(stats.id);
    const statsRowIds = (stats.records ?? []).map(
      (record: { id: string }) => record.id,
    );
    const statsNameId = stats.fields[0].id;

    // The rows being counted: one per owner, matched by the owner's name.
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: VALUE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: OWNER_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.owners.map((owner, index) => ({
        fields: { [VALUE_FIELD]: `item-${index}`, [OWNER_FIELD]: owner },
      })),
    });
    createdTableIds.unshift(source.id);
    const sourceRowIds = (source.records ?? []).map(
      (record: { id: string }) => record.id,
    );
    const sourceValueId = source.fields.find(
      (field: { name: string }) => field.name === VALUE_FIELD,
    )?.id;
    const sourceOwnerId = source.fields.find(
      (field: { name: string }) => field.name === OWNER_FIELD,
    )?.id;
    if (!sourceValueId || !sourceOwnerId || statsRowIds.length === 0) {
      throw new Error("the fixture tables are not in place");
    }

    const countField = await createField(stats.id, {
      name: COUNT_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        foreignTableId: source.id,
        lookupFieldId: sourceValueId,
        expression: "countall({values})",
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: sourceOwnerId,
              operator: "is",
              value: {
                type: "field",
                fieldId: statsNameId,
                tableId: stats.id,
              },
            },
          ],
        },
      },
    });

    const readCounts = async (): Promise<unknown[]> => {
      const response = await apiGetRecords(stats.id, {
        fieldKeyType: FieldKeyType.Id,
        take: statsRowIds.length,
      });
      return statsRowIds.map(
        (rowId) =>
          response.data.records.find(
            (record: { id: string }) => record.id === rowId,
          )?.fields[countField.id],
      );
    };
    const settle = async (
      done: (counts: unknown[]) => boolean,
    ): Promise<unknown[]> => {
      let counts = await readCounts();
      for (
        let attempt = 0;
        attempt < config.settleAttempts && !done(counts);
        attempt += 1
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, config.settleIntervalMs),
        );
        counts = await readCounts();
      }
      return counts;
    };

    // Fixture verification, outside the checkpoint: every owner is counting
    // their one row before anything is archived. Without it, a count that was
    // always empty would pass the checkpoint by accident.
    const before = await settle((counts) =>
      counts.every((count) => Number(count) === 1),
    );
    if (!before.every((count) => Number(count) === 1)) {
      throw new Error(
        `the counts read ${JSON.stringify(before)} before anything is archived, expected 1 for every owner`,
      );
    }

    const probe = await bugCheckpoint(
      "archiving-the-counted-rows-brings-the-count-down",
      async () => {
        const archived = await apiArchiveRecords(source.id, {
          recordIds: sourceRowIds,
        });

        // First that the rows really left the table. A count that stayed at
        // one would be correct if the archive had done nothing at all, and
        // that is a different report.
        const remaining = await apiGetRecords(source.id, {
          fieldKeyType: FieldKeyType.Id,
          take: sourceRowIds.length + 5,
        });
        if (remaining.data.records.length !== 0) {
          throw new Error(
            `${remaining.data.records.length} of ${sourceRowIds.length} rows are still in the table after archiving them - ` +
              "the archive did not take them, so the counts are not what is wrong here",
          );
        }

        const after = await settle((counts) =>
          counts.every((count) => count == null || Number(count) === 0),
        );
        const stale = after.filter(
          (count) => count != null && Number(count) !== 0,
        );
        if (stale.length > 0) {
          throw new Error(
            `${stale.length} of ${after.length} owners still count rows that are no longer in the table: ${JSON.stringify(after)} - ` +
              "the number the team plans around is the one that did not move",
          );
        }
        return {
          archivedCount: archived.data.archivedRecordIds?.length ?? 0,
          counts: after,
        };
      },
    );

    return {
      details: {
        statsTableId: stats.id,
        sourceTableId: source.id,
        owners: config.owners.length,
        archivedCount: probe.archivedCount,
        countsAfterArchive: probe.counts,
      },
    };
  } finally {
    for (const tableId of createdTableIds) {
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
