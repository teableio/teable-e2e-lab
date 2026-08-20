import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  createAccessToken,
  createAxios,
  deleteAccessToken,
  getRecords,
} from "@teable/openapi";
import {
  createBase,
  createSpace,
  createTable,
  permanentDeleteBase,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { normalizeBugError } from "../bug-error";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AccessTokenResourceIsolationCaseConfig } from "../types";

const MANUAL_SUBSCRIPTION = "/billing/subscription/manual";
const AUTHORITY_MATRIX_STATUS = (baseId: string) =>
  `/base/${baseId}/authority-matrix/status`;
const BASE_ACCESS_ALL = "/base/access/all";
const SPACE_LIST = "/space";
const FIELD_LIST = (tableId: string) => `/table/${tableId}/field`;
const RECORD_LIST = (tableId: string) => `/table/${tableId}/record`;
const VIEW_LIST = (tableId: string) => `/table/${tableId}/view`;
const ROW_COUNT = (tableId: string) =>
  `/table/${tableId}/aggregation/row-count`;

type ManualSubscription = { id: string };
type IdItem = { id?: string };
type RequestOutcome = {
  operation: string;
  status?: number;
  error?: string;
};

const capture = async (
  operation: string,
  request: () => Promise<{ status: number; data: unknown }>,
): Promise<{ outcome: RequestOutcome; data?: unknown }> => {
  try {
    const response = await request();
    return {
      outcome: { operation, status: response.status },
      data: response.data,
    };
  } catch (error) {
    const normalized = normalizeBugError(error);
    return {
      outcome: {
        operation,
        status: normalized.status,
        error: normalized.response ?? normalized.message,
      },
    };
  }
};

const idsFrom = (data: unknown): string[] =>
  Array.isArray(data)
    ? data
        .map((item: IdItem) => item?.id)
        .filter((id): id is string => typeof id === "string")
    : [];

const cleanup = async (
  bugCase: BugCaseFor<"access-token-resource-isolation">,
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

export const runAccessTokenResourceIsolationCase = async (
  bugCase: BugCaseFor<"access-token-resource-isolation">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AccessTokenResourceIsolationCaseConfig = bugCase.config;
  const suffix = context.runId;
  let spaceAId = "";
  let spaceBId = "";
  let baseAId = "";
  let baseBId = "";
  let tableBId = "";
  let tableBPrimaryFieldId = "";
  let subscriptionId = "";
  let accessTokenId = "";

  try {
    const spaceA = await createSpace({
      name: `${config.spaceNamePrefix}-a-${suffix}`,
    });
    spaceAId = spaceA.id;
    const spaceB = await createSpace({
      name: `${config.spaceNamePrefix}-b-${suffix}`,
    });
    spaceBId = spaceB.id;

    const subscription = await axios.post<ManualSubscription>(
      MANUAL_SUBSCRIPTION,
      {
        relateId: spaceBId,
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

    const baseA = await createBase({
      name: `${config.baseNamePrefix}-a-${suffix}`,
      spaceId: spaceAId,
    });
    baseAId = baseA.id;
    const baseB = await createBase({
      name: `${config.baseNamePrefix}-b-${suffix}`,
      spaceId: spaceBId,
    });
    baseBId = baseB.id;

    await createTable(baseAId, {
      name: `${config.tableNamePrefix}-a-${suffix}`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [],
    });
    const tableB = await createTable(baseBId, {
      name: `${config.tableNamePrefix}-b-${suffix}`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [],
    });
    tableBId = tableB.id;
    tableBPrimaryFieldId = tableB.fields[0]?.id ?? "";
    if (!tableBPrimaryFieldId) {
      throw new Error(`Target table ${tableBId} has no primary field`);
    }

    await axios.patch(AUTHORITY_MATRIX_STATUS(baseBId), { enabled: true });

    // Fixture verification stays outside the checkpoint: the owner can reach
    // the target through v2, and the target starts empty.
    const ownerBefore = await getRecords(tableBId, {
      fieldKeyType: FieldKeyType.Id,
      take: 10,
    });
    const routing = assertServedByV2(ownerBefore.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (ownerBefore.data.records.length !== 0) {
      throw new Error(
        `Target table ${tableBId} is not empty before the checkpoint`,
      );
    }

    const tokenResponse = await createAccessToken({
      name: `${config.spaceNamePrefix}-${suffix}`,
      scopes: [
        "space|read",
        "base|read",
        "base|read_all",
        "table|read",
        "view|read",
        "field|read",
        "record|read",
        "record|create",
      ],
      spaceIds: [spaceAId],
      expiredTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10),
    });
    accessTokenId = tokenResponse.data.id;
    const tokenClient = createAxios();
    tokenClient.defaults.baseURL = `${context.appUrl}/api`;
    tokenClient.defaults.headers.common.Authorization = `Bearer ${tokenResponse.data.token}`;

    const probe = await bugCheckpoint(
      "access-token-resource-range-remains-a-hard-bound",
      async () => {
        const baseList = await capture("list bases", () =>
          tokenClient.get(BASE_ACCESS_ALL),
        );
        const spaceList = await capture("list spaces", () =>
          tokenClient.get(SPACE_LIST),
        );
        const denied = await Promise.all([
          capture("read fields", () => tokenClient.get(FIELD_LIST(tableBId))),
          capture("read records", () => tokenClient.get(RECORD_LIST(tableBId))),
          capture("read views", () => tokenClient.get(VIEW_LIST(tableBId))),
          capture("read row count", () => tokenClient.get(ROW_COUNT(tableBId))),
          capture("create record", () =>
            tokenClient.post(RECORD_LIST(tableBId), {
              fieldKeyType: FieldKeyType.Id,
              records: [
                {
                  fields: {
                    [tableBPrimaryFieldId]: config.blockedRecordValue,
                  },
                },
              ],
            }),
          ),
        ]);

        const returnedBaseIds = idsFrom(baseList.data);
        const returnedSpaceIds = idsFrom(spaceList.data);
        const ownerAfter = await getRecords(tableBId, {
          fieldKeyType: FieldKeyType.Id,
          take: 10,
        });
        const outcomes = [
          baseList.outcome,
          spaceList.outcome,
          ...denied.map(({ outcome }) => outcome),
        ];

        const failures: string[] = [];
        if (baseList.outcome.status !== 200) {
          failures.push(
            `base list answered ${String(baseList.outcome.status)}, expected 200`,
          );
        }
        if (!returnedBaseIds.includes(baseAId)) {
          failures.push(`base list omitted authorized base ${baseAId}`);
        }
        if (returnedBaseIds.includes(baseBId)) {
          failures.push(`base list exposed out-of-range base ${baseBId}`);
        }
        if (spaceList.outcome.status !== 200) {
          failures.push(
            `space list answered ${String(spaceList.outcome.status)}, expected 200`,
          );
        }
        if (!returnedSpaceIds.includes(spaceAId)) {
          failures.push(`space list omitted authorized space ${spaceAId}`);
        }
        if (returnedSpaceIds.includes(spaceBId)) {
          failures.push(`space list exposed out-of-range space ${spaceBId}`);
        }
        for (const { outcome } of denied) {
          if (outcome.status !== 403) {
            failures.push(
              `${outcome.operation} answered ${String(outcome.status)}, expected 403${
                outcome.error ? ` (${outcome.error})` : ""
              }`,
            );
          }
        }
        if (ownerAfter.data.records.length !== 0) {
          failures.push(
            `blocked create left ${ownerAfter.data.records.length} record(s) in target table`,
          );
        }
        if (failures.length > 0) {
          throw new Error(failures.join("; "));
        }

        return {
          outcomes,
          returnedBaseIds,
          returnedSpaceIds,
          targetRecordCount: ownerAfter.data.records.length,
        };
      },
    );

    return {
      details: {
        spaceAId,
        spaceBId,
        baseAId,
        baseBId,
        tableBId,
        routing,
        ...probe,
      },
    };
  } finally {
    await cleanup(bugCase, "access token", accessTokenId, () =>
      deleteAccessToken(accessTokenId),
    );
    await cleanup(bugCase, "base", baseAId, () => permanentDeleteBase(baseAId));
    await cleanup(bugCase, "base", baseBId, () => permanentDeleteBase(baseBId));
    await cleanup(bugCase, "subscription", subscriptionId, () =>
      axios.delete(`${MANUAL_SUBSCRIPTION}/${subscriptionId}`, {
        params: { catalog: "cloud" },
      }),
    );
    await cleanup(bugCase, "space", spaceAId, () =>
      permanentDeleteSpace(spaceAId),
    );
    await cleanup(bugCase, "space", spaceBId, () =>
      permanentDeleteSpace(spaceBId),
    );
  }
};
