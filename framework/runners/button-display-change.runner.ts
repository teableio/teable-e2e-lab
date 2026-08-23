import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ButtonDisplayChangeCaseConfig } from "../types";

// A button column with clicks recorded against it -> change the button's label
// and colour -> checkpoint: the counts are still there.
//
// A button column counts how many times each row's button has been pressed,
// and the column's own settings cap that count. Renaming the button, recolouring
// it or adding a confirmation dialog is a presentation change - the sort of edit
// someone makes while tidying a base up, without expecting to touch data.
//
// It was treated as a change to what the column holds, so every row's count was
// rewritten. What that costs depends on what the count is for: a button capped
// at one press per row becomes pressable again on every row at once, and the
// record of who already ran it is gone.
//
// The counts are seeded with SQL because pressing the button runs the workflow
// behind it, and that is a different subject with its own timing. What the case
// is about is what an edit to the column's settings does to counts that are
// already there.

const NAME_FIELD = "Name";
const BUTTON_FIELD = "Run it";

export const runButtonDisplayChangeCase = async (
  bugCase: BugCaseFor<"button-display-change">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ButtonDisplayChangeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.seededCount < 1) {
    throw new Error(
      "the seeded count has to be something other than zero, or a wiped count and the seeded one are the " +
        "same number",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.rowTitles.map((title) => ({
        fields: { [NAME_FIELD]: title },
      })),
    });
    tableId = table.id;

    const buttonField = await createField(tableId, {
      name: BUTTON_FIELD,
      type: FieldType.Button,
      options: {
        label: config.labelBefore,
        color: config.colorBefore,
        maxCount: config.maxCountBefore,
        resetCount: false,
      },
    });

    // Setup, outside the checkpoint: put a click count on every row. Pressing
    // the button would run the workflow behind it, which is a different
    // subject; what this case is about is what a settings edit does to counts
    // that are already there.
    const db = fixtureDb(context.app);
    const physical = await db.physicalTable(tableId);
    const column = await db.physicalColumn(buttonField.id);
    await db.execute(
      `UPDATE "${physical.schema}"."${physical.table}" SET "${column}" = $1::jsonb`,
      JSON.stringify({ count: config.seededCount }),
    );

    const countsByRow = async () => {
      const read = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.rowTitles.length,
      });
      return {
        headers: read.headers,
        counts: Object.fromEntries(
          read.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              (record.fields[BUTTON_FIELD] as { count?: unknown } | undefined)
                ?.count ?? null,
            ],
          ),
        ) as Record<string, unknown>,
      };
    };

    // Fixture verification, outside the checkpoint: the counts are visible
    // over the API before the edit. If they were not, "the counts are gone"
    // afterwards would mean nothing.
    const before = await countsByRow();
    const notSeeded = config.rowTitles.filter(
      (title) => before.counts[title] !== config.seededCount,
    );
    if (notSeeded.length > 0) {
      throw new Error(
        `before the edit the counts read ${JSON.stringify(before.counts)}, expected ${config.seededCount} on ` +
          "every row - the fixture is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "renaming-a-button-keeps-the-clicks-recorded-against-it",
      async () => {
        // Label, colour, cap, a confirmation dialog: all presentation and
        // click policy, nothing about what the column holds.
        await convertField(tableId, buttonField.id, {
          name: BUTTON_FIELD,
          type: FieldType.Button,
          options: {
            label: config.labelAfter,
            color: config.colorAfter,
            maxCount: config.maxCountAfter,
            resetCount: false,
            confirm: {
              title: config.confirmTitle,
              description: config.confirmDescription,
              confirmText: config.labelAfter,
            },
          },
        });

        const after = await countsByRow();
        const routing = assertServedByV2(after.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const lost = config.rowTitles.filter(
          (title) => after.counts[title] !== config.seededCount,
        );
        if (lost.length > 0) {
          throw new Error(
            `after renaming the button the counts read ${JSON.stringify(after.counts)}, expected ` +
              `${config.seededCount} on every row - ${lost.length} of ${config.rowTitles.length} rows lost ` +
              "the record of having been pressed, so a button capped per row is pressable again",
          );
        }
        return { routing, counts: after.counts };
      },
    );

    return {
      details: {
        tableId,
        buttonFieldId: buttonField.id,
        seededCount: config.seededCount,
        countsAfter: probe.counts,
        routing: probe.routing,
      },
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
