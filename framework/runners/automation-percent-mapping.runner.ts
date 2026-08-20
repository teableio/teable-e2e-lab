import { FieldKeyType, FieldType, NumberFormattingType } from "@teable/core";
import { axios, createRecords, getRecords } from "@teable/openapi";
import {
  createBase,
  createSpace,
  createTable,
  permanentDeleteBase,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AutomationPercentMappingCaseConfig } from "../types";

const MANUAL_SUBSCRIPTION = "/billing/subscription/manual";
const WORKFLOW = (baseId: string) => `/base/${baseId}/workflow`;
const WORKFLOW_DETAIL = (baseId: string, workflowId: string) =>
  `/base/${baseId}/workflow/${workflowId}`;
const WORKFLOW_TRIGGER = (baseId: string, workflowId: string) =>
  `/base/${baseId}/workflow/${workflowId}/trigger`;
const WORKFLOW_ACTION = (baseId: string, workflowId: string) =>
  `/base/${baseId}/workflow/${workflowId}/action`;
const WORKFLOW_ACTIVE = (baseId: string, workflowId: string) =>
  `/base/${baseId}/workflow/${workflowId}/active`;
const WORKFLOW_RUNS = (baseId: string, workflowId: string) =>
  `/base/${baseId}/workflow/${workflowId}/run`;

type ManualSubscription = { id: string };
type Workflow = { id: string; isActive?: boolean };
type WorkflowNode = { id: string };
type WorkflowRun = { id: string; status: string };
type WorkflowRunList = { runs?: WorkflowRun[]; rowCount?: number };

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const cleanup = async (
  bugCase: BugCaseFor<"automation-percent-mapping">,
  label: string,
  resourceId: string,
  action: () => Promise<unknown>,
) => {
  if (!resourceId) return;
  try {
    await action();
  } catch (error) {
    console.warn(
      `[e2e-lab] cleanup failed for ${bugCase.id} (${label} ${resourceId}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

export const runAutomationPercentMappingCase = async (
  bugCase: BugCaseFor<"automation-percent-mapping">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AutomationPercentMappingCaseConfig = bugCase.config;
  if (!Number.isFinite(config.percentValue)) {
    throw new Error("percentValue must be a finite number");
  }
  if (config.precision < 0 || !Number.isInteger(config.precision)) {
    throw new Error("precision must be a non-negative integer");
  }

  const suffix = context.runId;
  let spaceId = "";
  let baseId = "";
  let subscriptionId = "";
  let sourceTableId = "";
  let targetTableId = "";
  let workflowId = "";

  try {
    const space = await createSpace({
      name: `${config.spaceNamePrefix}-${suffix}`,
    });
    spaceId = space.id;
    const subscription = await axios.post<ManualSubscription>(
      MANUAL_SUBSCRIPTION,
      {
        relateId: spaceId,
        email: globalThis.testConfig.email,
        catalog: "cloud",
        type: "base",
        level: "enterprise",
        quantity: 3,
        currentPeriodEnd: new Date(
          Date.now() + 24 * 60 * 60 * 1000,
        ).toISOString(),
      },
    );
    subscriptionId = subscription.data.id;

    const base = await createBase({
      name: `${config.baseNamePrefix}-${suffix}`,
      spaceId,
    });
    baseId = base.id;
    const numberField = {
      type: FieldType.Number,
      options: {
        formatting: {
          type: NumberFormattingType.Percent,
          precision: config.precision,
        },
      },
    } as const;
    const sourceTable = await createTable(baseId, {
      name: `${config.tableNamePrefix}-source-${suffix}`,
      fields: [{ name: "Source Percent", ...numberField }],
      records: [],
    });
    sourceTableId = sourceTable.id;
    const targetTable = await createTable(baseId, {
      name: `${config.tableNamePrefix}-target-${suffix}`,
      fields: [{ name: "Target Percent", ...numberField }],
      records: [],
    });
    targetTableId = targetTable.id;
    const sourceFieldId = sourceTable.fields[0]?.id;
    const targetFieldId = targetTable.fields[0]?.id;
    if (!sourceFieldId || !targetFieldId) {
      throw new Error("Percentage fixture fields were not created");
    }

    const workflow = await axios.post<Workflow>(WORKFLOW(baseId), {
      name: `${config.tableNamePrefix}-${suffix}`,
      description: "Preserve a numeric percentage through one variable",
    });
    workflowId = workflow.data.id;
    const trigger = await axios.post<WorkflowNode>(
      WORKFLOW_TRIGGER(baseId, workflowId),
      {
        type: "recordCreated",
        config: { tableId: sourceTableId },
      },
    );
    await axios.post(WORKFLOW_ACTION(baseId, workflowId), {
      parentNodeId: trigger.data.id,
      type: "createRecord",
      config: {
        tableId: targetTableId,
        fields: {
          [targetFieldId]: {
            resolvable: true,
            type: "array",
            nodes: [
              {
                resolvable: true,
                type: "fact",
                path: `$.record.fields.${sourceFieldId}`,
                fact: trigger.data.id,
              },
            ],
          },
        },
      },
    });
    await axios.put(WORKFLOW_ACTIVE(baseId, workflowId), {
      method: "activate",
    });

    // All fixture checks are outside the checkpoint: the workflow is active,
    // the target is empty, and the same public read path used below is v2.
    const activeWorkflow = await axios.get<Workflow>(
      WORKFLOW_DETAIL(baseId, workflowId),
    );
    if (activeWorkflow.data.isActive !== true) {
      throw new Error(`Workflow ${workflowId} is not active`);
    }
    const targetBefore = await getRecords(targetTableId, {
      fieldKeyType: FieldKeyType.Id,
      take: 10,
    });
    const routing = assertServedByV2(targetBefore.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (targetBefore.data.records.length !== 0) {
      throw new Error(
        `Target table ${targetTableId} is not empty before the checkpoint`,
      );
    }

    const probe = await bugCheckpoint(
      "single-variable-percent-mapping-preserves-number",
      async () => {
        const created = await createRecords(sourceTableId, {
          fieldKeyType: FieldKeyType.Id,
          records: [{ fields: { [sourceFieldId]: config.percentValue } }],
        });
        if (created.status !== 201 || created.data.records.length !== 1) {
          throw new Error(
            `source record creation answered ${created.status} with ${created.data.records.length} records`,
          );
        }

        const deadline = Date.now() + config.settleTimeoutMs;
        let runs: WorkflowRun[] = [];
        let targetRecords = targetBefore.data.records;
        for (;;) {
          const runResponse = await axios.get<WorkflowRunList>(
            WORKFLOW_RUNS(baseId, workflowId),
            { params: { take: 10 } },
          );
          runs = runResponse.data.runs ?? [];
          const targetResponse = await getRecords(targetTableId, {
            fieldKeyType: FieldKeyType.Id,
            take: 10,
          });
          targetRecords = targetResponse.data.records;
          const terminal = runs.every(
            (run) => run.status !== "pending" && run.status !== "running",
          );
          if (runs.length > 0 && terminal && targetRecords.length > 0) {
            break;
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.settlePollIntervalMs);
        }

        if (runs.length !== 1) {
          throw new Error(
            `workflow produced ${runs.length} runs, expected exactly 1`,
          );
        }
        if (runs[0]?.status !== "success") {
          throw new Error(
            `workflow run ${runs[0]?.id ?? "<missing>"} ended as ${runs[0]?.status ?? "missing"}, expected success`,
          );
        }
        if (targetRecords.length !== 1) {
          throw new Error(
            `automation created ${targetRecords.length} target records, expected exactly 1`,
          );
        }
        const observed = targetRecords[0]?.fields?.[targetFieldId];
        if (typeof observed !== "number") {
          throw new Error(
            `target percentage has type ${typeof observed}, expected number`,
          );
        }
        if (observed !== config.percentValue) {
          throw new Error(
            `target percentage is ${observed}, expected ${config.percentValue}`,
          );
        }

        return {
          sourceRecordId: created.data.records[0]?.id,
          workflowRunId: runs[0].id,
          workflowRunStatus: runs[0].status,
          targetRecordId: targetRecords[0]?.id,
          targetRecordCount: targetRecords.length,
          observed,
          observedType: typeof observed,
        };
      },
    );

    return {
      details: {
        spaceId,
        baseId,
        sourceTableId,
        targetTableId,
        workflowId,
        expected: config.percentValue,
        routing,
        ...probe,
      },
    };
  } finally {
    await cleanup(bugCase, "base", baseId, () => permanentDeleteBase(baseId));
    await cleanup(bugCase, "subscription", subscriptionId, () =>
      axios.delete(`${MANUAL_SUBSCRIPTION}/${subscriptionId}`, {
        params: { catalog: "cloud" },
      }),
    );
    await cleanup(bugCase, "space", spaceId, () =>
      permanentDeleteSpace(spaceId),
    );
  }
};
