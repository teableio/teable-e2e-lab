import {
  FieldKeyType,
  FieldType,
  NumberFormattingType,
  Relationship,
} from "@teable/core";
import {
  axios,
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RollupExpressionConvertCaseConfig } from "../types";

// A summary column over a linked people column, listing the distinct people ->
// change it to count them instead, which is a number and needs number
// formatting -> checkpoint: the change is accepted and the column reads as a
// count.
//
// Changing what a summary works out is an ordinary edit: the same menu that
// offered "the distinct values" offers "how many". Going from a list to a
// count changes what the column holds - words become a number - so the request
// carries number formatting with it, because a count with no formatting is not
// a thing the editor can save.
//
// The new formatting was validated against the OLD result type. Number
// formatting on a column that still counted as a list of words is not valid,
// so the edit was refused and the column stayed as it was: the person picks
// "how many", the dialog reports an error it does not explain, and the only
// way out is deleting the column and building it again.
//
// The case asserts the whole outcome rather than the status code alone: the
// change comes back, the stored column agrees when read fresh, and the row
// holds the count. A refusal, a silent no-op and an accepted change that does
// not recompute all look the same from the status line.

const NAME_FIELD = "Name";
const PEOPLE_FIELD = "Member";
const LINK_FIELD = "Members";
const ROLLUP_FIELD = "Member aggregate";

export const runRollupExpressionConvertCase = async (
  bugCase: BugCaseFor<"rollup-expression-convert">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RollupExpressionConvertCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.linkedRowNames.length < 2) {
    throw new Error(
      "two linked rows at least - with one, a count and a list of one look the same number",
    );
  }

  try {
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(source.id);
    const member = await createField(source.id, {
      name: PEOPLE_FIELD,
      type: FieldType.User,
      options: { isMultiple: false, shouldNotify: false },
    });
    // Every linked row names the same person, so "the distinct values" is a
    // list of one while "how many" is the number of rows - the two answers are
    // different numbers and cannot be confused for each other.
    const members = await apiCreateRecords(source.id, {
      fieldKeyType: FieldKeyType.Id,
      records: config.linkedRowNames.map((name) => ({
        fields: {
          [source.fields[0].id]: name,
          [member.id]: {
            // A user cell is written with both parts; sending only the id is
            // rejected on the title.
            id: globalThis.testConfig.userId,
            title: globalThis.testConfig.userName,
          },
        },
      })),
    });

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(host.id);
    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: source.id,
      },
    });
    const lookupOptions = {
      foreignTableId: source.id,
      linkFieldId: link.id,
      lookupFieldId: member.id,
    };
    // The summary as it stands: a list of words, with no numeric formatting in
    // its options - which is what the refused edit was validated against.
    const rollup = await createField(host.id, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      lookupOptions,
      options: {
        expression: config.expressionBefore,
        timeZone: config.timeZone,
      },
    });
    const created = await apiCreateRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [NAME_FIELD]: config.hostRowName,
            [link.id]: members.data.records.map(({ id }: { id: string }) => ({
              id,
            })),
          },
        },
      ],
    });
    const hostRowId = created.data.records[0]?.id;
    if (!hostRowId) {
      throw new Error("the host row is not in place");
    }

    // Fixture verification, outside the checkpoint: the column really is a
    // list of words today, and the row reaches every linked row. Without that
    // the edit would have nothing to change and a green checkpoint would mean
    // nothing.
    const before = await getField(host.id, rollup.id);
    if (
      before.isMultipleCellValue !== true ||
      before.cellValueType !== "string"
    ) {
      throw new Error(
        `the summary already reads as ${JSON.stringify({
          cellValueType: before.cellValueType,
          isMultipleCellValue: before.isMultipleCellValue,
        })}, expected a list of words - the fixture is not in place`,
      );
    }
    const beforeRows = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    assertServedByV2(beforeRows.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const beforeCell = beforeRows.data.records.find(
      (record: { id: string }) => record.id === hostRowId,
    )?.fields[rollup.id];
    const linkedCell = beforeRows.data.records.find(
      (record: { id: string }) => record.id === hostRowId,
    )?.fields[link.id];
    if (
      !Array.isArray(linkedCell) ||
      linkedCell.length !== config.linkedRowNames.length
    ) {
      throw new Error(
        `the host row reaches ${Array.isArray(linkedCell) ? linkedCell.length : 0} rows, expected ` +
          `${config.linkedRowNames.length} - the link is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-people-summary-can-be-changed-into-a-count",
      async () => {
        // Raw axios, not the helper: on the side where this is refused the
        // helper throws away the response, and both the routing headers and
        // the product's own reason for refusing are worth carrying into the
        // report.
        const converted = await axios.put(
          `/table/${host.id}/field/${rollup.id}/convert`,
          {
            name: ROLLUP_FIELD,
            type: FieldType.Rollup,
            lookupOptions,
            options: {
              expression: config.expressionAfter,
              timeZone: config.timeZone,
              formatting: {
                type: NumberFormattingType.Decimal,
                precision: config.precision,
              },
            },
          },
          { validateStatus: () => true },
        );
        const routing = assertServedByV2(converted.headers, {
          operation: "PUT /table/{tableId}/field/{fieldId}/convert",
          feature: "convertField",
        });
        if (converted.status < 200 || converted.status >= 300) {
          throw new Error(
            `changing the summary from ${config.expressionBefore} to ${config.expressionAfter} answered ` +
              `${converted.status}: ${JSON.stringify(converted.data)} - the column is still a list of words and ` +
              "the only way to a count is deleting it and building it again",
          );
        }

        const stored = await getField(host.id, rollup.id);
        if (
          stored.cellValueType !== "number" ||
          stored.isMultipleCellValue === true
        ) {
          throw new Error(
            `after the change the stored column reads as ${JSON.stringify({
              cellValueType: stored.cellValueType,
              isMultipleCellValue: stored.isMultipleCellValue,
            })}, expected a single number - the request was accepted and the column was not changed`,
          );
        }

        const rows = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 5,
        });
        const cell = rows.data.records.find(
          (record: { id: string }) => record.id === hostRowId,
        )?.fields[rollup.id];
        if (cell !== config.linkedRowNames.length) {
          throw new Error(
            `the row reads ${JSON.stringify(cell ?? null)}, expected ${config.linkedRowNames.length} - ` +
              "the column counts as a number and the number is not the one under it",
          );
        }
        return { routing, status: converted.status, cell };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        sourceTableId: source.id,
        expressionBefore: config.expressionBefore,
        expressionAfter: config.expressionAfter,
        valueBefore: beforeCell ?? null,
        convertStatus: probe.status,
        valueAfter: probe.cell,
        routing: probe.routing,
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
