import {
  Colors,
  DateFormattingPreset,
  FieldType,
  NumberFormattingType,
  RatingIcon,
  Relationship,
  SingleLineTextDisplayType,
  TimeFormatting,
} from "@teable/core";
import type { IFieldRo, IFieldVo } from "@teable/core";
import {
  axios,
  CONVERT_FIELD,
  GET_FIELD,
  GET_FIELD_LIST,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  deleteField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FieldOptionPreservationCaseConfig } from "../types";

type OptionCase = {
  label: string;
  create: IFieldRo;
  expected: Record<string, unknown>;
  expectedChoices?: string[];
  optionsRequiredOnConvert?: boolean;
};

type PreparedCase = OptionCase & {
  id: string;
  type: IFieldVo["type"];
};

const choicesOf = (field: IFieldVo) => {
  const choices = (
    field.options as { choices?: { name?: string }[] } | undefined
  )?.choices;
  return Array.isArray(choices)
    ? choices.map((choice) => choice.name ?? "")
    : [];
};

const assertSubset = (
  actual: unknown,
  expected: unknown,
  path: string,
): void => {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(
        `${path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
    }
    expected.forEach((item, index) =>
      assertSubset(actual[index], item, `${path}[${index}]`),
    );
    return;
  }
  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object") {
      throw new Error(
        `${path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
    }
    for (const [key, value] of Object.entries(expected)) {
      assertSubset(
        (actual as Record<string, unknown>)[key],
        value,
        `${path}.${key}`,
      );
    }
    return;
  }
  if (actual !== expected) {
    throw new Error(
      `${path} is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
};

const assertField = (field: IFieldVo, fieldCase: PreparedCase) => {
  if (field.id !== fieldCase.id) {
    throw new Error(
      `${fieldCase.label} changed identity from ${fieldCase.id} to ${field.id}`,
    );
  }
  if (field.type !== fieldCase.type) {
    throw new Error(
      `${fieldCase.label} changed type from ${fieldCase.type} to ${field.type}`,
    );
  }
  assertSubset(field.options, fieldCase.expected, `${fieldCase.label}.options`);
  if (fieldCase.expectedChoices) {
    const choices = choicesOf(field);
    if (JSON.stringify(choices) !== JSON.stringify(fieldCase.expectedChoices)) {
      throw new Error(
        `${fieldCase.label} choices are ${JSON.stringify(choices)}, expected ${JSON.stringify(fieldCase.expectedChoices)}`,
      );
    }
  }
};

const baseOptionCases = (): OptionCase[] => [
  {
    label: "Markdown notes",
    create: {
      name: "Notes",
      type: FieldType.LongText,
      options: { showAs: { type: "markdown" } },
    },
    expected: { showAs: { type: "markdown" } },
  },
  {
    label: "Website URL",
    create: {
      name: "Website",
      type: FieldType.SingleLineText,
      options: { showAs: { type: SingleLineTextDisplayType.Url } },
    },
    expected: { showAs: { type: SingleLineTextDisplayType.Url } },
  },
  {
    label: "Status choices",
    create: {
      name: "Status",
      type: FieldType.SingleSelect,
      options: {
        choices: [
          { name: "Todo", color: Colors.Blue },
          { name: "Done", color: Colors.Green },
        ],
        preventAutoNewOptions: true,
        defaultValue: "Todo",
      },
    },
    expected: { preventAutoNewOptions: true, defaultValue: "Todo" },
    expectedChoices: ["Todo", "Done"],
  },
  {
    label: "Tag choices",
    create: {
      name: "Tags",
      type: FieldType.MultipleSelect,
      options: {
        choices: [
          { name: "Frontend", color: Colors.Purple },
          { name: "Backend", color: Colors.Orange },
        ],
        defaultValue: ["Frontend"],
      },
    },
    expected: { defaultValue: ["Frontend"] },
    expectedChoices: ["Frontend", "Backend"],
  },
  {
    label: "Amount formatting",
    create: {
      name: "Amount",
      type: FieldType.Number,
      options: {
        formatting: {
          type: NumberFormattingType.Currency,
          precision: 2,
          symbol: "$",
        },
      },
    },
    expected: {
      formatting: {
        type: NumberFormattingType.Currency,
        precision: 2,
        symbol: "$",
      },
    },
  },
  {
    label: "Progress bar",
    create: {
      name: "Progress",
      type: FieldType.Number,
      options: {
        formatting: { type: NumberFormattingType.Decimal, precision: 0 },
        showAs: {
          type: "bar",
          color: Colors.Green,
          showValue: true,
          maxValue: 100,
        },
      },
    },
    expected: {
      formatting: { type: NumberFormattingType.Decimal, precision: 0 },
      showAs: {
        type: "bar",
        color: Colors.Green,
        showValue: true,
        maxValue: 100,
      },
    },
  },
  {
    label: "Due date formatting",
    create: {
      name: "Due",
      type: FieldType.Date,
      options: {
        formatting: {
          date: DateFormattingPreset.ISO,
          time: TimeFormatting.Hour24,
          timeZone: "Asia/Shanghai",
        },
      },
    },
    expected: {
      formatting: {
        date: DateFormattingPreset.ISO,
        time: TimeFormatting.Hour24,
        timeZone: "Asia/Shanghai",
      },
    },
  },
  {
    label: "Rating display",
    create: {
      name: "Score",
      type: FieldType.Rating,
      options: { max: 5, icon: RatingIcon.Star, color: Colors.YellowBright },
    },
    expected: { max: 5, icon: RatingIcon.Star, color: Colors.YellowBright },
  },
  {
    label: "Checkbox default",
    create: {
      name: "Approved",
      type: FieldType.Checkbox,
      options: { defaultValue: true },
    },
    expected: { defaultValue: true },
  },
  {
    label: "Formula formatting",
    create: {
      name: "Calculated",
      type: FieldType.Formula,
      options: {
        expression: "1 + 1",
        formatting: { type: NumberFormattingType.Decimal, precision: 1 },
      },
    },
    expected: {
      expression: "1 + 1",
      formatting: { type: NumberFormattingType.Decimal, precision: 1 },
    },
    optionsRequiredOnConvert: true,
  },
];

export const runFieldOptionPreservationCase = async (
  bugCase: BugCaseFor<"field-option-preservation">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FieldOptionPreservationCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];
  const dependencyFieldIds: { tableId: string; fieldId: string }[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: "Source", type: FieldType.SingleLineText, isPrimary: true },
        { name: "Source amount", type: FieldType.Number },
      ],
      records: [],
    });
    tableIds.unshift(foreign.id);
    const amountField = foreign.fields.find(
      (field: IFieldVo) => field.name === "Source amount",
    );
    if (!amountField) {
      throw new Error("the rollup source amount field was not created");
    }

    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.unshift(table.id);

    const prepared: PreparedCase[] = [];
    for (const fieldCase of baseOptionCases()) {
      const created = await createField(table.id, fieldCase.create);
      prepared.push({ ...fieldCase, id: created.id, type: created.type });
    }

    const tracked = await createField(table.id, {
      name: "Last editor",
      type: FieldType.LastModifiedBy,
      options: { trackedFieldIds: [table.fields[0].id] },
    });
    prepared.push({
      label: "Tracked last editor",
      create: { name: tracked.name, type: FieldType.LastModifiedBy },
      expected: { trackedFieldIds: [table.fields[0].id] },
      id: tracked.id,
      type: tracked.type,
    });

    const link = await createField(table.id, {
      name: "Orders",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: foreign.id,
        isOneWay: true,
      },
    });
    dependencyFieldIds.unshift({ tableId: table.id, fieldId: link.id });
    prepared.push({
      label: "One-way relationship",
      create: { name: link.name, type: FieldType.Link },
      expected: {
        relationship: Relationship.ManyMany,
        foreignTableId: foreign.id,
        isOneWay: true,
      },
      optionsRequiredOnConvert: true,
      id: link.id,
      type: link.type,
    });

    const rollup = await createField(table.id, {
      name: "Order total",
      type: FieldType.Rollup,
      options: {
        expression: "sum({values})",
        formatting: { type: NumberFormattingType.Decimal, precision: 2 },
      },
      lookupOptions: {
        foreignTableId: foreign.id,
        lookupFieldId: amountField.id,
        linkFieldId: link.id,
      },
    });
    dependencyFieldIds.unshift({ tableId: table.id, fieldId: rollup.id });
    prepared.push({
      label: "Rollup expression",
      create: { name: rollup.name, type: FieldType.Rollup },
      expected: {
        expression: "sum({values})",
        formatting: { type: NumberFormattingType.Decimal, precision: 2 },
      },
      optionsRequiredOnConvert: true,
      id: rollup.id,
      type: rollup.type,
    });

    // The editor loads the field list before saving. Keep the behavior check
    // for that response inside the checkpoint, but prove here that the exact
    // response came from the v2 field-read path.
    const listed = await axios.get<IFieldVo[]>(
      urlBuilder(GET_FIELD_LIST, { tableId: table.id }),
    );
    const routing = assertServedByV2(listed.headers, {
      feature: "getFields",
      operation: "reading the fields before editing them",
    });

    const probe = await bugCheckpoint(
      "field-options-survive-editor-round-trips",
      async () => {
        const listedById = new Map<string, IFieldVo>(
          listed.data.map((field) => [field.id, field]),
        );
        const results: { label: string; fieldId: string }[] = [];

        for (const fieldCase of prepared) {
          const asReported = listedById.get(fieldCase.id);
          if (!asReported) {
            throw new Error(
              `${fieldCase.label} (${fieldCase.id}) is absent from the field list`,
            );
          }
          assertField(asReported, fieldCase);

          const convertBody = {
            name: `${asReported.name} renamed`,
            type: asReported.type,
            ...(fieldCase.optionsRequiredOnConvert
              ? { options: asReported.options }
              : {}),
            ...(asReported.lookupOptions
              ? { lookupOptions: asReported.lookupOptions }
              : {}),
          };
          const renamed = await axios.put<IFieldVo>(
            urlBuilder(CONVERT_FIELD, {
              tableId: table.id,
              fieldId: fieldCase.id,
            }),
            convertBody,
          );
          assertServedByV2(renamed.headers, {
            feature: "convertField",
            operation: `renaming ${fieldCase.label}`,
          });
          assertField(renamed.data, fieldCase);

          const resubmitted = await axios.put<IFieldVo>(
            urlBuilder(CONVERT_FIELD, {
              tableId: table.id,
              fieldId: fieldCase.id,
            }),
            {
              name: `${asReported.name} resubmitted`,
              type: asReported.type,
              options: asReported.options ?? {},
              ...(asReported.lookupOptions
                ? { lookupOptions: asReported.lookupOptions }
                : {}),
            },
          );
          assertField(resubmitted.data, fieldCase);

          const after = await axios.get<IFieldVo>(
            urlBuilder(GET_FIELD, {
              tableId: table.id,
              fieldId: fieldCase.id,
            }),
          );
          assertField(after.data, fieldCase);
          results.push({ label: fieldCase.label, fieldId: fieldCase.id });
        }

        return { results };
      },
    );

    return {
      details: {
        tableId: table.id,
        coveredCaseIds: config.coveredCaseIds,
        checkedFields: probe.results,
        routing,
      },
    };
  } finally {
    for (const dependency of dependencyFieldIds) {
      try {
        await deleteField(dependency.tableId, dependency.fieldId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (field ${dependency.fieldId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    for (const tableId of tableIds) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
