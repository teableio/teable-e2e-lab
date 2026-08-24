import { Colors, FieldKeyType, FieldType } from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecords as apiUpdateRecords,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SparseBatchUpdateCaseConfig } from "../types";

// Update several rows at once, mentioning a column for some of them and not
// for others -> checkpoint: the rows that were not mentioned keep what they
// had.
//
// A batch write is what every integration sends: a nightly sync updating
// whatever changed, a script writing back a handful of columns, an automation
// touching one thing per row. Different rows carry different fields, because
// only what changed is sent.
//
// A column left out of one row's part of the write was cleared on that row.
// Nothing failed, nothing was reported, and the value is simply gone from the
// rows the sender never mentioned - which is the worst way for data to
// disappear, because the sender's own log says the write succeeded and the
// rows it did mention are all correct.
//
// The row that does mention the column is the control: it has to end up with
// its new value, so "the write did nothing" and "the write cleared what it did
// not mention" are told apart.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";
const NOTES_FIELD = "Notes";

export const runSparseBatchUpdateCase = async (
  bugCase: BugCaseFor<"sparse-batch-update">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SparseBatchUpdateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: [
              { name: config.statusKept, color: Colors.Blue },
              { name: config.statusWritten, color: Colors.Green },
            ],
          },
        },
        { name: NOTES_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.untouchedRowTitle,
            [STATUS_FIELD]: config.statusKept,
            [NOTES_FIELD]: config.notesBefore,
          },
        },
        {
          fields: {
            [NAME_FIELD]: config.writtenRowTitle,
            [STATUS_FIELD]: config.statusKept,
            [NOTES_FIELD]: config.notesBefore,
          },
        },
      ],
    });
    tableId = table.id;
    const rowIdByName = new Map<string, string>(
      table.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD] ?? ""),
          record.id,
        ],
      ),
    );
    const untouchedId = rowIdByName.get(config.untouchedRowTitle);
    const writtenId = rowIdByName.get(config.writtenRowTitle);
    if (!untouchedId || !writtenId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readRows = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 2,
      });
      return {
        headers: read.headers,
        rows: Object.fromEntries(
          read.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              {
                status: record.fields[STATUS_FIELD] ?? null,
                notes: record.fields[NOTES_FIELD] ?? null,
              },
            ],
          ),
        ) as Record<string, { status: unknown; notes: unknown }>,
      };
    };

    // Fixture verification, outside the checkpoint: both rows start with a
    // status. Clearing something that was never there would pass anywhere.
    const before = await readRows();
    if (
      before.rows[config.untouchedRowTitle]?.status !== config.statusKept ||
      before.rows[config.writtenRowTitle]?.status !== config.statusKept
    ) {
      throw new Error(
        `before the write the rows read ${JSON.stringify(before.rows)} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-batch-write-leaves-the-columns-it-did-not-mention",
      async () => {
        // One write, two rows, different fields per row - the shape every
        // integration sends, because only what changed is sent.
        await apiUpdateRecords(tableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: [
            {
              id: untouchedId,
              fields: { [NOTES_FIELD]: config.notesAfter },
            },
            {
              id: writtenId,
              fields: {
                [NOTES_FIELD]: config.notesAfter,
                [STATUS_FIELD]: config.statusWritten,
              },
            },
          ],
        });

        const after = await readRows();
        const routing = assertServedByV2(after.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const untouched = after.rows[config.untouchedRowTitle];
        const written = after.rows[config.writtenRowTitle];

        if (untouched?.status !== config.statusKept) {
          throw new Error(
            `the write never mentioned ${STATUS_FIELD} for ${config.untouchedRowTitle}, and that row now ` +
              `reads ${JSON.stringify(untouched)} - the value is gone from a row nobody wrote to, and the ` +
              "sender's log says the write succeeded",
          );
        }
        if (untouched?.notes !== config.notesAfter) {
          throw new Error(
            `${config.untouchedRowTitle} did not take the value the write did mention: ` +
              JSON.stringify(untouched),
          );
        }
        // The control: the row that did mention the column has to have taken
        // the new value, or "the write did nothing" would pass.
        if (written?.status !== config.statusWritten) {
          throw new Error(
            `${config.writtenRowTitle} mentioned ${STATUS_FIELD} and reads ${JSON.stringify(written)} - the ` +
              "write did not land at all",
          );
        }
        return { routing, rows: after.rows };
      },
    );

    return {
      details: { tableId, rowsAfter: probe.rows, routing: probe.routing },
    };
  } finally {
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
