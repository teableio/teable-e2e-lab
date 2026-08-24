import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getFields as apiGetFields,
  getRecords as apiGetRecords,
  CONVERT_FIELD,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { OversizedSelectChoiceCaseConfig } from "../types";

// A text column with a very long entry in it -> turn the column into a list of
// choices -> checkpoint: the change is refused and the column is untouched.
//
// Turning free text into a set of choices is how a column gets tidied up once
// people have been typing into it: every distinct value becomes an option.
// That works while the values are short. One row where somebody pasted a
// paragraph turns that paragraph into an option, and from then on the
// dropdown - and every filter, group and colour rule built on the column -
// carries a page of prose as one of its entries.
//
// The limit exists for that reason. What matters as much is what happens when
// the change is refused: the column has to be left exactly as it was, because
// the person's next step is to shorten the one long value and try again.

const NAME_FIELD = "Name";
const SUBJECT_FIELD = "Category";

export const runOversizedSelectChoiceCase = async (
  bugCase: BugCaseFor<"oversized-select-choice">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: OversizedSelectChoiceCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.oversizedLength <= config.limit) {
    throw new Error(
      `the long value has to be longer than the ${config.limit}-character limit, or there is nothing to ` +
        "refuse",
    );
  }

  const oversized = "x".repeat(config.oversizedLength);
  const rows = [
    { name: "short-1", value: config.shortValues[0] },
    { name: "the-long-one", value: oversized },
    { name: "short-2", value: config.shortValues[1] },
  ];

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SUBJECT_FIELD, type: FieldType.LongText },
      ],
      records: rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [SUBJECT_FIELD]: row.value },
      })),
    });
    tableId = table.id;
    const subjectFieldId = table.fields.find(
      (field: { name: string }) => field.name === SUBJECT_FIELD,
    )?.id;
    if (!subjectFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readColumn = async () => {
      const fields = await apiGetFields(tableId, {
        fieldKeyType: FieldKeyType.Id,
      });
      const rowsNow = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: rows.length,
      });
      const field = fields.data.find(
        (candidate: { id: string }) => candidate.id === subjectFieldId,
      ) as
        | { type?: string; options?: { choices?: { name: string }[] } }
        | undefined;
      return {
        type: field?.type,
        choices: (field?.options?.choices ?? []).map((choice) => choice.name),
        values: Object.fromEntries(
          rowsNow.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              String(record.fields[SUBJECT_FIELD] ?? ""),
            ],
          ),
        ) as Record<string, string>,
      };
    };

    // Fixture verification, outside the checkpoint: the long value is really
    // in the column, at its full length.
    const before = await readColumn();
    if (before.values["the-long-one"]?.length !== config.oversizedLength) {
      throw new Error(
        `the long row holds ${before.values["the-long-one"]?.length ?? 0} characters, expected ` +
          `${config.oversizedLength} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-value-too-long-to-be-a-choice-is-refused",
      async () => {
        const response = await axios.put(
          urlBuilder(CONVERT_FIELD, { tableId, fieldId: subjectFieldId }),
          { name: SUBJECT_FIELD, type: FieldType.SingleSelect },
          { validateStatus: () => true },
        );

        const after = await readColumn();
        if (response.status >= 200 && response.status < 300) {
          const longest = Math.max(
            0,
            ...after.choices.map((choice) => choice.length),
          );
          throw new Error(
            `turning the column into a list of choices answered ${response.status} and produced ` +
              `${after.choices.length} choices, the longest ${longest} characters - a paragraph is now an ` +
              "option in the dropdown, in every filter and in every colour rule",
          );
        }

        // Refused is the right answer, and the column has to be exactly as it
        // was: the person's next step is to shorten that one value and retry.
        if (after.type !== before.type) {
          throw new Error(
            `the change was refused but the column is now ${JSON.stringify(after.type)}, was ` +
              `${JSON.stringify(before.type)}`,
          );
        }
        for (const row of rows) {
          if (after.values[row.name] !== before.values[row.name]) {
            throw new Error(
              `the change was refused but ${row.name} no longer holds what it held`,
            );
          }
        }
        return { status: response.status };
      },
    );

    return {
      details: {
        tableId,
        refusedStatus: probe.status,
        limit: config.limit,
        longestValue: config.oversizedLength,
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
