import {
  FieldKeyType,
  FieldType,
  NumberFormattingType,
  Relationship,
} from "@teable/core";
import {
  axios,
  CONVERT_FIELD,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupOfFormulaEditableCaseConfig } from "../types";

// A column borrowing a worked-out column from another table -> open its
// settings and save them -> checkpoint: the save is accepted and the column
// still reads.
//
// Borrowing a column is the same action whatever kind of column is borrowed,
// and what comes back is a column like any other: it can be renamed, its
// display can be changed, it can be turned into something else.
//
// Borrowing a worked-out column copied that column's instruction along with it.
// The borrowed column then carried an instruction that made no sense where it
// now was, and everything that had to read it stumbled: saving the column's own
// settings was refused, so the column could not be renamed, reformatted or
// converted - it just sat there, and the only way past it was deleting it.
//
// The value is asserted as well as the save. A build that accepted the save by
// dropping what the column shows would pass a case that only looked at the
// status.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";
const LEAF_LINK_FIELD = "Leaf";
const BORROWED_AMOUNT_FIELD = "Borrowed amount";
const WORKED_OUT_FIELD = "Doubled";
const LINK_FIELD = "Source";
const BORROWED_FIELD = "Borrowed total";

export const runLookupOfFormulaEditableCase = async (
  bugCase: BugCaseFor<"lookup-of-formula-editable">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupOfFormulaEditableCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    // Three tables, because the instruction the borrowing column copies has to
    // be one that already reaches outside its own table. The leaf holds the
    // number; the source borrows it and works something out from what it
    // borrowed; the host borrows that.
    const leaf = await createTable(baseId, {
      name: `${suffix}-leaf`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: [
        { fields: { [NAME_FIELD]: "leaf", [AMOUNT_FIELD]: config.amount } },
      ],
    });
    createdTableIds.unshift(leaf.id);
    const leafAmountId = leaf.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;
    const leafRowId = leaf.records?.[0]?.id as string;

    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "source" } }],
    });
    createdTableIds.unshift(source.id);
    const sourceRowId = source.records?.[0]?.id as string;
    const leafLink = await createField(source.id, {
      name: LEAF_LINK_FIELD,
      type: FieldType.Link,
      options: { relationship: Relationship.ManyOne, foreignTableId: leaf.id },
    });
    await apiUpdateRecord(source.id, sourceRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [leafLink.id]: { id: leafRowId } } },
    });
    const borrowedAmount = await createField(source.id, {
      name: BORROWED_AMOUNT_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: leaf.id,
        linkFieldId: leafLink.id,
        lookupFieldId: leafAmountId,
      },
    });

    // The worked-out column that gets borrowed, and it is worked out FROM a
    // borrowed column. That is the shape left untried after a two-column
    // formula was measured green on both sides (run 34582424969): the
    // instruction copied onto the borrowing column already names another
    // table's column before it is copied anywhere.
    const workedOut = await createField(source.id, {
      name: WORKED_OUT_FIELD,
      type: FieldType.Formula,
      options: { expression: `{${borrowedAmount.id}} * 2` },
    });

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowName } }],
    });
    createdTableIds.unshift(host.id);
    const hostRowId = host.records?.[0]?.id as string;
    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: source.id,
      },
    });
    await apiUpdateRecord(host.id, hostRowId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [link.id]: { id: sourceRowId } } },
    });

    const lookupOptions = {
      foreignTableId: source.id,
      linkFieldId: link.id,
      lookupFieldId: workedOut.id,
    };
    const borrowed = await createField(host.id, {
      name: BORROWED_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions,
    });

    const readBorrowed = async () => {
      const rows = await apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        headers: rows.headers,
        value: rows.data.records[0]?.fields[borrowed.id] ?? null,
      };
    };

    // Fixture verification, outside the checkpoint: the borrowed column really
    // shows the worked-out value. Saving the settings of a column that shows
    // nothing would prove nothing.
    const before = await readBorrowed();
    assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const expectedValue = config.amount * 2;
    if (Number(before.value) !== expectedValue) {
      throw new Error(
        `the borrowed column reads ${JSON.stringify(before.value)}, expected ${expectedValue} - the fixture ` +
          "is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-borrowed-worked-out-column-can-be-saved",
      async () => {
        // The ordinary save from the column's settings screen: a new name and
        // a display change, with what it borrows unchanged.
        const saved = await axios.put(
          urlBuilder(CONVERT_FIELD, { tableId: host.id, fieldId: borrowed.id }),
          {
            name: config.newName,
            type: FieldType.Number,
            isLookup: true,
            lookupOptions,
            options: {
              formatting: {
                type: NumberFormattingType.Decimal,
                precision: config.newPrecision,
              },
            },
          },
          { validateStatus: () => true },
        );
        if (saved.status < 200 || saved.status >= 300) {
          throw new Error(
            `saving the borrowed column's own settings answered ${saved.status}: ${JSON.stringify(saved.data)} - ` +
              "the column cannot be renamed, reformatted or converted, and the only way past it is deleting it",
          );
        }

        const described = (await getFields(host.id)).find(
          (field: { id: string }) => field.id === borrowed.id,
        ) as { name?: string; options?: { formatting?: unknown } } | undefined;
        if (described?.name !== config.newName) {
          throw new Error(
            `the save answered ${saved.status} and the column is still called ${JSON.stringify(described?.name)}`,
          );
        }

        const after = await readBorrowed();
        if (Number(after.value) !== expectedValue) {
          throw new Error(
            `after the save the column reads ${JSON.stringify(after.value)}, expected ${expectedValue} - the ` +
              "save was accepted by dropping what the column shows",
          );
        }
        return { status: saved.status, value: after.value };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        sourceTableId: source.id,
        saveStatus: probe.status,
        valueAfter: probe.value,
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
