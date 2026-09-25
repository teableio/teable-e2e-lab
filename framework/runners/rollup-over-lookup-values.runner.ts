import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RollupOverLookupValuesCaseConfig } from "../types";

// Source rows -> a middle table that borrows their label and amount through a
// link -> a top table that summarises the middle rows -> checkpoint: summaries
// over the borrowed columns give the same answer as summaries over plain
// columns holding the same values.
//
// Two summaries went wrong when their input was itself borrowed. Joining the
// labels gave ["Alpha", "Beta"] - a list printed as text - instead of
// "Alpha, Beta". Collecting the distinct amounts gave ["15", "20"], numbers
// turned into text, and the column declared as numbers showed nothing at all.
//
// The middle table also holds plain copies of the same label and amount, and
// the same two summaries run over those as the control. They were right before
// the fix; if they are wrong, the question here is not the one being asked.

const NAME_FIELD = "Name";
const LABEL_FIELD = "Label";
const AMOUNT_FIELD = "Amount";
const PLAIN_LABEL_FIELD = "Plain label";
const PLAIN_AMOUNT_FIELD = "Plain amount";
const SOURCE_LINK_FIELD = "Source";
const BORROWED_LABEL_FIELD = "Borrowed label";
const BORROWED_AMOUNT_FIELD = "Borrowed amount";
const MIDDLE_LINK_FIELD = "Middle";

export const runRollupOverLookupValuesCase = async (
  bugCase: BugCaseFor<"rollup-over-lookup-values">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RollupOverLookupValuesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.items.length < 2) {
    throw new Error(
      "two items at least - a list of one and a single value can print the same",
    );
  }
  if (
    new Set(config.items.map((item) => item.amount)).size !==
    config.items.length
  ) {
    throw new Error(
      "the amounts must differ, or the distinct list is shorter than the input",
    );
  }
  const expectedJoin = config.items.map((item) => item.label).join(", ");
  const expectedAmounts = config.items.map((item) => item.amount);

  try {
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: LABEL_FIELD, type: FieldType.SingleLineText },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.items.map((item, index) => ({
        fields: {
          [NAME_FIELD]: `source-${index}`,
          [LABEL_FIELD]: item.label,
          [AMOUNT_FIELD]: item.amount,
        },
      })),
    });
    createdTableIds.unshift(source.id);
    const sourceFieldId = (name: string) =>
      source.fields.find((field: { name: string }) => field.name === name)
        ?.id as string;
    const sourceIds = source.records.map((record: { id: string }) => record.id);

    // The middle table: one row per item, linked to its source row, with a
    // plain copy of the same values beside the borrowed ones.
    const middle = await createTable(baseId, {
      name: `${suffix}-middle`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: PLAIN_LABEL_FIELD, type: FieldType.SingleLineText },
        { name: PLAIN_AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: [],
    });
    createdTableIds.unshift(middle.id);
    const middleFieldId = (name: string) =>
      middle.fields.find((field: { name: string }) => field.name === name)
        ?.id as string;
    const sourceLink = await createField(middle.id, {
      name: SOURCE_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: source.id,
      },
    });
    const borrowedLabel = await createField(middle.id, {
      name: BORROWED_LABEL_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: source.id,
        linkFieldId: sourceLink.id,
        lookupFieldId: sourceFieldId(LABEL_FIELD),
      },
    });
    const borrowedAmount = await createField(middle.id, {
      name: BORROWED_AMOUNT_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        foreignTableId: source.id,
        linkFieldId: sourceLink.id,
        lookupFieldId: sourceFieldId(AMOUNT_FIELD),
      },
    });
    const middleRows = await apiCreateRecords(middle.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: config.items.map((item, index) => ({
        fields: {
          [NAME_FIELD]: `middle-${index}`,
          [PLAIN_LABEL_FIELD]: item.label,
          [PLAIN_AMOUNT_FIELD]: item.amount,
          [SOURCE_LINK_FIELD]: [{ id: sourceIds[index] as string }],
        },
      })),
    });
    const middleIds = middleRows.data.records.map(
      (record: { id: string }) => record.id,
    );

    const top = await createTable(baseId, {
      name: `${suffix}-top`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(top.id);
    const middleLink = await createField(top.id, {
      name: MIDDLE_LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: middle.id,
      },
    });
    const summary = async (
      name: string,
      expression: string,
      lookupFieldId: string,
    ) =>
      createField(top.id, {
        name,
        type: FieldType.Rollup,
        options: { expression },
        lookupOptions: {
          foreignTableId: middle.id,
          linkFieldId: middleLink.id,
          lookupFieldId,
        },
      });
    const borrowedJoin = await summary(
      "Joined borrowed labels",
      "array_join({values})",
      borrowedLabel.id,
    );
    const borrowedUnique = await summary(
      "Distinct borrowed amounts",
      "array_unique({values})",
      borrowedAmount.id,
    );
    const plainJoin = await summary(
      "Joined plain labels",
      "array_join({values})",
      middleFieldId(PLAIN_LABEL_FIELD),
    );
    const plainUnique = await summary(
      "Distinct plain amounts",
      "array_unique({values})",
      middleFieldId(PLAIN_AMOUNT_FIELD),
    );

    await apiCreateRecords(top.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: config.topRowName,
            [MIDDLE_LINK_FIELD]: middleIds.map((id: string) => ({ id })),
          },
        },
      ],
    });

    const readTop = async () => {
      const response = await apiGetRecords(top.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 2,
      });
      const row = response.data.records[0];
      if (!row || response.data.records.length !== 1) {
        throw new Error(
          `the top table holds ${response.data.records.length} rows, expected 1`,
        );
      }
      return { response, fields: row.fields as Record<string, unknown> };
    };

    // Fixture verification, outside the checkpoint: the summaries over the
    // plain columns give the right answer. Those were right before the fix, so
    // if they are not, the harness or the data is off - not this bug.
    const first = await readTop();
    const routing = assertServedByV2(first.response.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const control = {
      join: first.fields[plainJoin.id],
      unique: first.fields[plainUnique.id],
    };
    if (
      control.join !== expectedJoin ||
      JSON.stringify(control.unique) !== JSON.stringify(expectedAmounts)
    ) {
      throw new Error(
        `the control summaries over plain columns read ${JSON.stringify(control)}, ` +
          `expected join ${JSON.stringify(expectedJoin)} and distinct ${JSON.stringify(expectedAmounts)}`,
      );
    }

    const probe = await bugCheckpoint(
      "summaries-over-borrowed-columns-match-plain-ones",
      async () => {
        const { fields } = await readTop();
        const joined = fields[borrowedJoin.id];
        const unique = fields[borrowedUnique.id];
        const problems: string[] = [];
        if (joined !== expectedJoin) {
          problems.push(
            `joining the borrowed labels gave ${JSON.stringify(joined)}, expected ${JSON.stringify(expectedJoin)}`,
          );
        }
        if (JSON.stringify(unique) !== JSON.stringify(expectedAmounts)) {
          problems.push(
            `the distinct borrowed amounts came back as ${JSON.stringify(unique)}, expected ${JSON.stringify(expectedAmounts)}`,
          );
        }
        if (problems.length > 0) {
          throw new Error(
            `${problems.join("; ")} - the same summaries over plain columns holding the same values ` +
              `gave ${JSON.stringify(control)}`,
          );
        }
        return { joined, unique };
      },
    );

    return {
      details: {
        tableIds: createdTableIds,
        routing,
        control,
        borrowed: probe,
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
