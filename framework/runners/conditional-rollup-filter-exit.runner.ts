import { FieldType } from "@teable/core";
import {
  createField,
  createTable,
  getRecord,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ConditionalRollupFilterExitCaseConfig,
} from "../types";
import {
  describeResponse,
  dropTables,
  isSuccess,
  rawRequest,
  sleep,
} from "./raw-api";

// A conditional rollup counting events whose computed source and target
// types match what a version expects, where both types are multi-value
// conditional lookups through a node table -> a node's type moves into the
// match and back out -> checkpoint: after each step the existing rollup reads
// what a rollup created fresh on the same data reads (1, then 0).
//
// The rollup was not refreshed when the computed values its filter reads
// changed: depending on the revision a row entering the match was not counted,
// or a row leaving it stayed counted. Either way a dashboard count drifted from
// the data, and only a freshly created copy of the column showed the real
// number - two columns with identical configuration disagreed.
//
// The shape is the reported one, with generic names: three tables, a join
// key, and the filter reaching the computed fields with hasAnyOf.

const NAME_FIELD = "Name";
const NODE_KEY = "NodeKey";
const NODE_TYPE = "NodeType";
const VERSION_KEY = "VersionKey";
const EXPECTED_SOURCE = "ExpectedSource";
const EXPECTED_TARGET = "ExpectedTarget";
const SOURCE_KEY = "SourceNodeKey";
const TARGET_KEY = "TargetNodeKey";

export const runConditionalRollupFilterExitCase = async (
  bugCase: BugCaseFor<"conditional-rollup-filter-exit">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalRollupFilterExitCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const name = (part: string) =>
    `${config.tableNamePrefix}-${part}-${context.runId}`;
  const select = (fieldName: string) => ({
    name: fieldName,
    type: FieldType.SingleSelect,
    options: { choices: config.types.map((type) => ({ name: type })) },
  });

  try {
    const nodes = await createTable(baseId, {
      name: name("nodes"),
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NODE_KEY, type: FieldType.SingleLineText },
        select(NODE_TYPE),
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "source-node",
            [NODE_KEY]: "source-node",
            [NODE_TYPE]: config.sourceTypeOutside,
          },
        },
        {
          fields: {
            [NAME_FIELD]: "target-node",
            [NODE_KEY]: "target-node",
            [NODE_TYPE]: config.expectedTarget,
          },
        },
      ],
    });
    tableIds.push(nodes.id);
    const versions = await createTable(baseId, {
      name: name("versions"),
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: VERSION_KEY, type: FieldType.SingleLineText },
        select(EXPECTED_SOURCE),
        select(EXPECTED_TARGET),
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "version-1",
            [VERSION_KEY]: "V1",
            [EXPECTED_SOURCE]: config.expectedSource,
            [EXPECTED_TARGET]: config.expectedTarget,
          },
        },
      ],
    });
    tableIds.push(versions.id);
    const events = await createTable(baseId, {
      name: name("events"),
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: VERSION_KEY, type: FieldType.SingleLineText },
        { name: SOURCE_KEY, type: FieldType.SingleLineText },
        { name: TARGET_KEY, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "event-1",
            [VERSION_KEY]: "V1",
            [SOURCE_KEY]: "source-node",
            [TARGET_KEY]: "target-node",
          },
        },
        {
          // Never matches: its target is the source node.
          fields: {
            [NAME_FIELD]: "noise",
            [VERSION_KEY]: "V1",
            [SOURCE_KEY]: "source-node",
            [TARGET_KEY]: "source-node",
          },
        },
      ],
    });
    tableIds.push(events.id);
    const idOf = (
      table: { fields: { id: string; name: string }[] },
      fieldName: string,
    ) => {
      const id = table.fields.find((field) => field.name === fieldName)?.id;
      if (!id) {
        throw new Error(`no ${fieldName} column`);
      }
      return id;
    };

    const typesThrough = async (fieldName: string, keyFieldName: string) =>
      createField(events.id, {
        name: fieldName,
        type: FieldType.SingleSelect,
        isLookup: true,
        isConditionalLookup: true,
        lookupOptions: {
          foreignTableId: nodes.id,
          lookupFieldId: idOf(nodes, NODE_TYPE),
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: idOf(nodes, NODE_KEY),
                operator: "is",
                value: { type: "field", fieldId: idOf(events, keyFieldName) },
              },
            ],
          },
        },
      });
    const sourceTypes = await typesThrough("SourceTypes", SOURCE_KEY);
    const targetTypes = await typesThrough("TargetTypes", TARGET_KEY);

    const createCount = (fieldName: string) =>
      rawRequest<{ id?: string }>("POST", `/table/${versions.id}/field`, {
        name: fieldName,
        type: FieldType.ConditionalRollup,
        options: {
          foreignTableId: events.id,
          lookupFieldId: idOf(events, NAME_FIELD),
          expression: "countall({values})",
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: idOf(events, VERSION_KEY),
                operator: "is",
                value: { type: "field", fieldId: idOf(versions, VERSION_KEY) },
              },
              {
                fieldId: sourceTypes.id,
                operator: "hasAnyOf",
                value: {
                  type: "field",
                  fieldId: idOf(versions, EXPECTED_SOURCE),
                },
              },
              {
                fieldId: targetTypes.id,
                operator: "hasAnyOf",
                value: {
                  type: "field",
                  fieldId: idOf(versions, EXPECTED_TARGET),
                },
              },
            ],
          },
        },
      });
    const existing = await createCount("MatchingEvents");
    if (!isSuccess(existing) || !existing.data?.id) {
      throw new Error(
        `creating the rollup answered ${describeResponse(existing)}`,
      );
    }
    assertServedByV2(existing.headers, {
      operation: "POST /table/{tableId}/field",
      feature: "createField",
    });
    const rollupId = existing.data.id;
    const versionId = versions.records[0].id;
    const sourceNodeId = nodes.records[0].id;
    const nodeTypeId = idOf(nodes, NODE_TYPE);

    const countOf = async (fieldId: string) => {
      const value = (await getRecord(versions.id, versionId)).fields[fieldId];
      return value == null ? 0 : Number(value);
    };
    const settle = async (fieldId: string, wanted: number) => {
      let count = await countOf(fieldId);
      for (
        let attempt = 0;
        attempt < config.settleAttempts && count !== wanted;
        attempt++
      ) {
        await sleep(config.settleIntervalMs);
        count = await countOf(fieldId);
      }
      return count;
    };

    // Setup: the count starts at 0, before anything has moved.
    if ((await settle(rollupId, 0)) !== 0) {
      throw new Error(
        `the rollup starts at ${await countOf(rollupId)}, expected 0`,
      );
    }

    // Each step is judged against a rollup created fresh on the same data:
    // when the fresh one sees the change and the existing one does not, the
    // existing one was not refreshed. When neither sees it, the fixture is
    // wrong, and the message says which.
    const freshCount = async (label: string) => {
      const fresh = await createCount(`${label}-${Date.now()}`);
      if (!isSuccess(fresh) || !fresh.data?.id) {
        throw new Error(
          `creating the control rollup answered ${describeResponse(fresh)}`,
        );
      }
      return countOf(fresh.data.id);
    };

    const probe = await bugCheckpoint(
      "a-conditional-rollup-follows-a-row-into-and-out-of-its-filter",
      async () => {
        const steps: Record<string, unknown> = {};
        for (const [step, type, wanted] of [
          ["entered", config.expectedSource, 1],
          ["left", config.sourceTypeOutside, 0],
        ] as const) {
          await updateRecordByApi(nodes.id, sourceNodeId, nodeTypeId, type);
          const existingCount = await settle(rollupId, wanted);
          const controlCount = await freshCount(`Control-${step}`);
          steps[step] = { existingCount, controlCount };
          if (existingCount !== wanted || controlCount !== wanted) {
            throw new Error(
              `after the source node ${step} the match the existing rollup reads ${existingCount} and a fresh one ` +
                `with the same configuration reads ${controlCount}; both should be ${wanted}` +
                (controlCount === wanted
                  ? " - the existing rollup was not refreshed"
                  : " - the fresh rollup disagrees too, so the fixture is not what the case expects"),
            );
          }
        }
        return steps;
      },
    );

    return { details: { versionsTableId: versions.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
