import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  Relationship,
  TimeFormatting,
} from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecords as apiUpdateRecords,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FormulaOverDateLookupCaseConfig } from "../types";

// A formula reading a date that came from another table -> change that date ->
// checkpoint: the formula follows.
//
// A lookup of a date is stored as json, not as a date, and a formula that
// reads one has to unwrap it before treating it as a date. It did not, so the
// computed update failed - and a failed computed task takes the table's other
// computed columns with it, which is why the report was about a status column
// that stopped updating rather than about the formula anyone had written.
//
// The neighbouring column is in the fixture for that reason: it is what shows
// the failure spreading past the column that caused it.

const NAME_FIELD = "Name";
const DATE_FIELD = "Completed";
const STATUS_FIELD = "Status";
const LINK_FIELD = "Job";
const DATE_LOOKUP_FIELD = "Completed Date";
const STATUS_LOOKUP_FIELD = "Job Status";
const FORMULA_FIELD = "Completed Echo";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runFormulaOverDateLookupCase = async (
  bugCase: BugCaseFor<"formula-over-date-lookup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FormulaOverDateLookupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let sourceTableId = "";
  let hostTableId = "";

  if (config.dateBefore === config.dateAfter) {
    throw new Error(
      "the two dates have to differ - writing the same one back queues no recompute and the columns would " +
        "still read what the first pass put there",
    );
  }
  if (config.statusBefore === config.statusAfter) {
    throw new Error(
      "the two statuses have to differ - the neighbouring column is here to show it following the same " +
        "write, and an unchanged value cannot show that",
    );
  }

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
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
        { name: STATUS_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "job-1",
            [DATE_FIELD]: config.dateBefore,
            [STATUS_FIELD]: config.statusBefore,
          },
        },
      ],
    });
    sourceTableId = sourceTable.id;
    const sourceFieldId = (name: string) =>
      sourceTable.fields.find((field: { name: string }) => field.name === name)
        ?.id;
    const dateFieldId = sourceFieldId(DATE_FIELD);
    const statusFieldId = sourceFieldId(STATUS_FIELD);
    const sourceRecordId = sourceTable.records[0]?.id;
    if (!dateFieldId || !statusFieldId || !sourceRecordId) {
      throw new Error(`Source table ${sourceTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    hostTableId = hostTable.id;
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: sourceTableId,
        relationship: Relationship.ManyOne,
      },
    });
    const dateLookup = await createField(hostTableId, {
      name: DATE_LOOKUP_FIELD,
      type: FieldType.Date,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: dateFieldId,
        linkFieldId: linkField.id,
      },
    });
    // The neighbour: an ordinary lookup with nothing wrong with it, on the
    // same table and therefore in the same computed pass.
    await createField(hostTableId, {
      name: STATUS_LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: statusFieldId,
        linkFieldId: linkField.id,
      },
    });
    await createField(hostTableId, {
      name: FORMULA_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${dateLookup.id}}` },
    });
    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: "the-row",
            [LINK_FIELD]: { id: sourceRecordId },
          },
        },
      ],
    });

    const readRow = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      const fields = response.data.records[0]?.fields ?? {};
      const asText = (value: unknown) =>
        Array.isArray(value)
          ? value.map(String).join(",")
          : String(value ?? "");
      return {
        headers: response.headers,
        formula: asText(fields[FORMULA_FIELD]),
        status: asText(fields[STATUS_LOOKUP_FIELD]),
      };
    };

    const settle = async (date: string, status: string, what: string) => {
      const day = date.slice(0, 10);
      const deadline = Date.now() + config.settleTimeoutMs;
      let seen = { formula: "", status: "" };
      for (;;) {
        const current = await readRow();
        seen = { formula: current.formula, status: current.status };
        if (seen.formula.includes(day) && seen.status === status) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `after ${config.settleTimeoutMs}ms ${what} reads ${JSON.stringify(seen)}, expected the formula ` +
              `to contain ${JSON.stringify(day)} and the neighbouring column to read ` +
              `${JSON.stringify(status)}`,
          );
        }
        await sleep(config.pollIntervalMs);
      }
    };

    // Fixture verification, outside the checkpoint: both columns computed once
    // already. A formula that never worked would make "it stopped following"
    // describe something that never followed.
    const seeded = await settle(
      config.dateBefore,
      config.statusBefore,
      "the columns before the change",
    );
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "formula-over-a-looked-up-date-follows-a-change",
      async () => {
        await apiUpdateRecords(sourceTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: [
            {
              id: sourceRecordId,
              fields: {
                [DATE_FIELD]: config.dateAfter,
                [STATUS_FIELD]: config.statusAfter,
              },
            },
          ],
        });
        const after = await settle(
          config.dateAfter,
          config.statusAfter,
          "the columns after the change",
        );
        return { formula: after.formula, status: after.status };
      },
    );

    return {
      details: {
        sourceTableId,
        hostTableId,
        routing,
        formulaAfter: probe.formula,
        neighbourAfter: probe.status,
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
