import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { axios } from "@teable/openapi";
import {
  createBase,
  createSpace,
  createTable,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { fixtureDb } from "../fixture-db";
import type {
  AutomationLegacyReciprocalLinkCaseConfig,
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
} from "../types";
import { sleep } from "./raw-api";

// Two bases in one space: follow-ups in one, orders in the other, joined by a
// two-way link -> an automation in the follow-up base that, when a follow-up
// is created, finds the order it names and links the two -> the automation
// works when freshly activated -> its stored snapshot is put back to what an
// automation activated before the cross-base write checks shipped looks like
// -> checkpoint: the next follow-up still gets linked, on both sides.
//
// Linking across bases writes the reciprocal cell in the other base too, so
// the write needs permission over that base. Automations run as a robot whose
// own rights stop at the base the automation lives in, so the check borrows
// the rights of the person who activated it, which activation now records in
// the snapshot. Snapshots taken before that existed record nothing, and the
// run fell back to the robot's own rights: every such automation started
// failing at the moment of the upgrade and kept failing until somebody
// switched it off and on again. Nobody had changed anything.
//
// The control run matters. It proves this automation, unchanged, links fine
// when activated today, so the only difference at the checkpoint is the
// snapshot's age. The snapshot is edited with SQL because "activated before an
// upgrade" is not something a request can ask for.

const NAME = "Name";
const REF = "Order ref";
const LINK = "Order";

interface LinkCell {
  id: string;
}

const linkedIds = (value: unknown): string[] => {
  if (!value) return [];
  const cells = Array.isArray(value) ? value : [value];
  return cells
    .map((cell) => (cell as LinkCell | undefined)?.id)
    .filter((id): id is string => typeof id === "string");
};

export const runAutomationLegacyReciprocalLinkCase = async (
  bugCase: BugCaseFor<"automation-legacy-reciprocal-link">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AutomationLegacyReciprocalLinkCaseConfig = bugCase.config;
  const prefix = `${config.namePrefix}-${context.runId}`;
  const db = fixtureDb(context.app);
  let spaceId = "";
  let homeBaseId = "";
  let workflowId = "";

  try {
    spaceId = (await createSpace({ name: prefix })).id;
    homeBaseId = (await createBase({ spaceId, name: `${prefix}-follow-ups` }))
      .id;
    const orderBaseId = (
      await createBase({ spaceId, name: `${prefix}-orders` })
    ).id;

    const orders = await createTable(orderBaseId, {
      name: "Orders",
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: config.orderRefs.map((ref) => ({ fields: { [NAME]: ref } })),
    });
    const followUps = await createTable(homeBaseId, {
      name: "Follow-ups",
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        { name: REF, type: FieldType.SingleLineText },
      ],
      records: [],
    });
    const orderNameId = orders.fields.find((f) => f.name === NAME)!.id;
    const refId = followUps.fields.find((f) => f.name === REF)!.id;

    const linkResponse = await axios.post(`/table/${followUps.id}/field`, {
      name: LINK,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: orders.id,
        baseId: orderBaseId,
        isOneWay: false,
      },
    });
    const linkId = linkResponse.data.id as string;
    const symmetricId = linkResponse.data.options?.symmetricFieldId as
      | string
      | undefined;
    if (!symmetricId) {
      throw new Error(
        `the cross-base link was created without a reciprocal field: ${JSON.stringify(linkResponse.data)}`,
      );
    }

    // The automation: follow-up created -> find its order -> link them.
    const base = `/base/${homeBaseId}/workflow`;
    workflowId = (await axios.post(base, { name: prefix })).data.id;
    const trigger = (
      await axios.post(`${base}/${workflowId}/trigger`, {
        type: "recordCreated",
        config: { tableId: followUps.id },
      })
    ).data;
    const search = (
      await axios.post(`${base}/${workflowId}/action`, {
        parentNodeId: trigger.id,
        type: "getRecords",
        config: {
          baseId: orderBaseId,
          tableId: orders.id,
          take: { type: "literal", value: "1", resolvable: true },
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: orderNameId,
                operator: "is",
                value: {
                  type: "fact",
                  fact: trigger.id,
                  path: `$.record.fields.${refId}`,
                  resolvable: true,
                },
              },
            ],
          },
        },
      })
    ).data;
    await axios.post(`${base}/${workflowId}/action`, {
      parentNodeId: search.id,
      type: "updateRecord",
      config: {
        tableId: followUps.id,
        recordId: {
          type: "fact",
          fact: trigger.id,
          path: "$.record.id",
          resolvable: true,
        },
        fields: {
          [linkId]: {
            type: "fact",
            fact: search.id,
            path: "$.records..id",
            resolvable: true,
          },
        },
      },
    });
    await axios.put(`${base}/${workflowId}/active`, { method: "activate" });

    const orderIdByRef = new Map<string, string>();
    {
      const listed = await axios.get(`/table/${orders.id}/record`, {
        params: { fieldKeyType: FieldKeyType.Id },
      });
      for (const record of listed.data.records as Array<{
        id: string;
        fields: Record<string, unknown>;
      }>) {
        orderIdByRef.set(String(record.fields[orderNameId]), record.id);
      }
    }

    // A follow-up for `ref`, then wait for the automation to link it. Returns
    // what both sides of the link say once it lands, or after the deadline.
    const followUpAndWait = async (ref: string) => {
      const created = await axios.post(`/table/${followUps.id}/record`, {
        fieldKeyType: FieldKeyType.Id,
        records: [{ fields: { [followUps.fields[0]!.id]: ref, [refId]: ref } }],
      });
      const recordId = created.data.records[0].id as string;
      const orderId = orderIdByRef.get(ref)!;
      const deadline = Date.now() + config.settleTimeoutMs;
      let ownSide: string[] = [];
      let otherSide: string[] = [];
      let routing: ReturnType<typeof assertServedByV2> | undefined;
      while (Date.now() < deadline) {
        const own = await axios.get(
          `/table/${followUps.id}/record/${recordId}`,
          { params: { fieldKeyType: FieldKeyType.Id } },
        );
        routing ??= assertServedByV2(own.headers, {
          operation: "GET /table/{tableId}/record/{recordId}",
          feature: "getRecords",
        });
        ownSide = linkedIds(own.data.fields[linkId]);
        const other = await axios.get(`/table/${orders.id}/record/${orderId}`, {
          params: { fieldKeyType: FieldKeyType.Id },
        });
        otherSide = linkedIds(other.data.fields[symmetricId]);
        if (ownSide.includes(orderId) && otherSide.includes(recordId)) break;
        await sleep(500);
      }
      return { recordId, orderId, ownSide, otherSide, routing };
    };

    // Why the run did not link, from the run history: the newest run and the
    // steps that failed in it.
    const latestRunEvidence = async () => {
      const runs = await axios.get(`${base}/${workflowId}/run`, {
        params: { skip: 0, take: 1 },
        validateStatus: () => true,
      });
      const run = runs.data?.runs?.[0];
      if (!run) return { runs: runs.data };
      const steps = await axios.get(`${base}/${workflowId}/run/${run.id}`, {
        validateStatus: () => true,
      });
      const failed = Array.isArray(steps.data)
        ? steps.data.filter(
            (step: { status?: string }) => step.status !== "success",
          )
        : steps.data;
      return { runStatus: run.status, failedSteps: failed };
    };

    // Control: activated today, the automation links across bases.
    const control = await followUpAndWait(config.orderRefs[0]!);
    if (
      !control.ownSide.includes(control.orderId) ||
      !control.otherSide.includes(control.recordId)
    ) {
      throw new Error(
        "the freshly activated automation did not link across bases, so the fixture is not what the case expects: " +
          JSON.stringify({ ...control, evidence: await latestRunEvidence() }),
      );
    }

    // The state: the active snapshot as an automation activated before the
    // upgrade carries it. Revisions that never recorded anything are left as
    // they are.
    await db.execute(
      `UPDATE "workflow_snapshot"
          SET "snapshot" = "snapshot"::jsonb - 'reciprocalAuthorization'
        WHERE "id" = (SELECT "active_snapshot_id" FROM "workflow" WHERE "id" = $1)`,
      workflowId,
    );
    const left = await db.query<{ remaining: number }[]>(
      `SELECT COUNT(*)::int AS remaining
         FROM "workflow_snapshot" s
         JOIN "workflow" w ON w."active_snapshot_id" = s."id"
        WHERE w."id" = $1 AND s."snapshot"::jsonb ? 'reciprocalAuthorization'`,
      workflowId,
    );
    if ((left[0]?.remaining ?? 0) !== 0) {
      throw new Error(
        "the active snapshot still records who activated it, so it does not look like one from before the upgrade",
      );
    }

    const probe = await bugCheckpoint(
      "an-automation-from-before-the-upgrade-still-links-across-bases",
      async () => {
        const result = await followUpAndWait(config.orderRefs[1]!);
        if (
          !result.ownSide.includes(result.orderId) ||
          !result.otherSide.includes(result.recordId)
        ) {
          throw new Error(
            `the automation activated before the upgrade did not link the follow-up to its order within ${config.settleTimeoutMs}ms ` +
              `(follow-up side ${JSON.stringify(result.ownSide)}, order side ${JSON.stringify(result.otherSide)}); ` +
              `the run says ${JSON.stringify(await latestRunEvidence())}`,
          );
        }
        return { recordId: result.recordId, orderId: result.orderId };
      },
    );

    return {
      details: {
        spaceId,
        workflowId,
        routing: control.routing,
        control: { recordId: control.recordId, orderId: control.orderId },
        ...probe,
      },
    };
  } finally {
    if (workflowId && homeBaseId) {
      await axios
        .put(`/base/${homeBaseId}/workflow/${workflowId}/active`, {
          method: "deactivate",
        })
        .catch(() => undefined);
    }
    if (spaceId) {
      try {
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
