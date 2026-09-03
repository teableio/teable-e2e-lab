import { FieldType, Relationship } from "@teable/core";
import { axios, CREATE_FIELD, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

const invalidSpecs = {
  rollup: [
    { source: "Amount", expression: "and({values})" },
    { source: "Flag", expression: "sum({values})" },
    { source: "Action", expression: "countall({values})" },
  ],
  conditionalRollup: [
    { source: "Action", expression: "counta({values})" },
    { source: "Amount", expression: "and({values})" },
    { source: "Flag", expression: "sum({values})" },
  ],
} as const;

export const runRollupCreateValidationCase = async (
  bugCase: BugCaseFor<"rollup-create-validation">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
        { name: "MatchKey", type: FieldType.SingleLineText },
        { name: "Amount", type: FieldType.Number },
        { name: "Flag", type: FieldType.Checkbox },
        {
          name: "Action",
          type: FieldType.Button,
          options: { label: "Run", color: "teal" },
        },
      ],
      records: [],
    });
    tableIds.unshift(foreign.id);
    const sourceIds = Object.fromEntries(
      foreign.fields.map((field: { name: string; id: string }) => [
        field.name,
        field.id,
      ]),
    );

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
        { name: "MatchKey", type: FieldType.SingleLineText },
      ],
      records: [],
    });
    tableIds.unshift(host.id);
    const hostMatchKeyId = host.fields.find(
      (field: { name: string }) => field.name === "MatchKey",
    )?.id;
    if (
      !sourceIds.Amount ||
      !sourceIds.Flag ||
      !sourceIds.Action ||
      !sourceIds.MatchKey ||
      !hostMatchKeyId
    ) {
      throw new Error("the rollup compatibility fixture is incomplete");
    }

    const link =
      config.mode === "rollup"
        ? await createField(host.id, {
            name: "Children",
            type: FieldType.Link,
            options: {
              relationship: Relationship.OneMany,
              foreignTableId: foreign.id,
            },
          })
        : undefined;

    const fieldPayload = (name: string, source: string, expression: string) =>
      config.mode === "rollup"
        ? {
            name,
            type: FieldType.Rollup,
            options: { expression },
            lookupOptions: {
              foreignTableId: foreign.id,
              linkFieldId: link!.id,
              lookupFieldId: sourceIds[source],
            },
          }
        : {
            name,
            type: FieldType.ConditionalRollup,
            options: {
              foreignTableId: foreign.id,
              lookupFieldId: sourceIds[source],
              expression,
              filter: {
                conjunction: "and",
                filterSet: [
                  {
                    fieldId: sourceIds.MatchKey,
                    operator: "is",
                    value: { type: "field", fieldId: hostMatchKeyId },
                  },
                ],
              },
            },
          };

    // A valid create through the same controller proves the fixture and v2
    // route before rejected requests become the bug observation.
    const control = await axios.post(
      urlBuilder(CREATE_FIELD, { tableId: host.id }),
      fieldPayload("Valid Control", "Amount", "sum({values})"),
      { validateStatus: () => true },
    );
    if (control.status < 200 || control.status >= 300) {
      throw new Error(
        `the valid control field was refused with ${control.status}`,
      );
    }
    const routing = assertServedByV2(control.headers, {
      operation: "POST /table/{tableId}/field",
      feature: "createField",
    });

    const probe = await bugCheckpoint(
      "incompatible-rollups-are-rejected-before-persistence",
      async () => {
        const attempts: { name: string; status: number; body: unknown }[] = [];
        for (const [index, spec] of invalidSpecs[config.mode].entries()) {
          const name = `Invalid ${index + 1} ${spec.source}`;
          const response = await axios.post(
            urlBuilder(CREATE_FIELD, { tableId: host.id }),
            fieldPayload(name, spec.source, spec.expression),
            { validateStatus: () => true },
          );
          attempts.push({ name, status: response.status, body: response.data });
          if (response.status < 400 || response.status >= 500) {
            throw new Error(
              `${spec.source} + ${spec.expression} answered ${response.status}, expected a clear 4xx rejection`,
            );
          }
        }

        const fields = await getFields(host.id);
        const persisted = fields
          .map((field: { name: string }) => field.name)
          .filter((name: string) => name.startsWith("Invalid "));
        if (persisted.length > 0) {
          throw new Error(
            `rejected incompatible fields still persisted: ${JSON.stringify(persisted)}`,
          );
        }
        return { attempts };
      },
    );

    return {
      details: {
        mode: config.mode,
        sourceTableId: foreign.id,
        hostTableId: host.id,
        routing,
        attempts: probe.attempts,
      },
    };
  } finally {
    for (const tableId of tableIds) {
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
    }
  }
};
