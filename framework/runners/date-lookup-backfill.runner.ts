import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  Relationship,
  TimeFormatting,
} from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DateLookupBackfillCaseConfig } from "../types";

// Two tables already linked one-to-one, one carrying a date -> add a column
// that borrows that date -> checkpoint: the date is there.
//
// This is the ordinary order of work. The link is set up first because that is
// the part people think about; borrowing a date across it is the small thing
// they add afterwards, once the rows are already connected.
//
// Adding it that way left the column empty. Not wrong - empty, on every row,
// with the date sitting one table away and the link plainly in place. The
// person has no reason to suspect the order they did things in, so the usual
// next step is to delete the column and make it again, which does not help
// either.
//
// The case waits for the value rather than reading once: filling a new column
// in is work that happens after the request answers, and a case that read
// immediately would call slow "empty".

const NAME_FIELD = "Name";
const DATE_FIELD = "Close date";
const BORROWED_FIELD = "Close date, borrowed";

export const runDateLookupBackfillCase = async (
  bugCase: BugCaseFor<"date-lookup-backfill">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DateLookupBackfillCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-opportunities`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: "UTC",
            },
          },
        },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "the-opportunity",
            [DATE_FIELD]: config.closeDate,
          },
        },
      ],
    });
    createdTableIds.unshift(foreign.id);
    const foreignRowId = foreign.records?.[0]?.id;
    const dateFieldId = foreign.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    if (!foreignRowId || !dateFieldId) {
      throw new Error("the opportunities table is not in place");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-submissions`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowName } }],
    });
    createdTableIds.unshift(host.id);
    const hostRowId = host.records?.[0]?.id;
    if (!hostRowId) {
      throw new Error("the submissions table is not in place");
    }

    const link = await createField(host.id, {
      name: "Opportunity",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneOne,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });
    await apiUpdateRecord(host.id, hostRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [link.id]: { id: foreignRowId } } },
    });

    // Fixture verification, outside the checkpoint: the two rows are connected
    // before the borrowing column exists. That order is the whole case, and a
    // link that never landed would leave the column correctly empty.
    const linked = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const linkCell = linked.data.records.find(
      (record: { id: string }) => record.id === hostRowId,
    )?.fields[link.id] as { id?: string } | undefined;
    if (linkCell?.id !== foreignRowId) {
      throw new Error(
        `the submission is linked to ${JSON.stringify(linkCell)}, expected the opportunity row - the link is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-date-borrowed-after-the-link-exists-arrives",
      async () => {
        const borrowed = await createField(host.id, {
          name: BORROWED_FIELD,
          type: FieldType.Date,
          isLookup: true,
          lookupOptions: {
            foreignTableId: foreign.id,
            linkFieldId: link.id,
            lookupFieldId: dateFieldId,
          },
        });

        let value: unknown;
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          const read = await apiGetRecords(host.id, {
            fieldKeyType: FieldKeyType.Id,
            take: 5,
          });
          const cell = read.data.records.find(
            (record: { id: string }) => record.id === hostRowId,
          )?.fields[borrowed.id];
          value = Array.isArray(cell) ? cell[0] : cell;
          if (value != null) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }
        if (value == null) {
          throw new Error(
            `the borrowed date is empty after ${config.settleAttempts} tries - the date is one table away and the link is in place, ` +
              "so the column was added over rows that were already connected and never filled in",
          );
        }
        if (String(value) !== config.closeDate) {
          throw new Error(
            `the borrowed date reads ${JSON.stringify(value)}, expected ${JSON.stringify(config.closeDate)}`,
          );
        }
        return { value };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        borrowedDate: probe.value,
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
