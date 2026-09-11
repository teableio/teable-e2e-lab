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
const BONUS_FIELD = "Bonus";
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
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
        { name: BONUS_FIELD, type: FieldType.Number },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "row",
            [AMOUNT_FIELD]: config.amount,
            [BONUS_FIELD]: config.bonus,
          },
        },
      ],
    });
    createdTableIds.unshift(source.id);
    const amountFieldId = source.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;
    const bonusFieldId = source.fields.find(
      (field: { name: string }) => field.name === BONUS_FIELD,
    )?.id as string;
    const sourceRowId = source.records?.[0]?.id as string;

    // The worked-out column that gets borrowed, and it reads TWO columns of its
    // own table. That is deliberate: a borrowed one-column formula is accepted
    // and saved on both sides - three shapes of it were measured green in an
    // earlier pass (runs 32675528990, 32675852808, 32676121196) - and what the
    // copied instruction stumbles on is being unparseable where it lands.
    const workedOut = await createField(source.id, {
      name: WORKED_OUT_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `{${amountFieldId}} * 2 + {${bonusFieldId}}`,
      },
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
    const expectedValue = config.amount * 2 + config.bonus;
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
