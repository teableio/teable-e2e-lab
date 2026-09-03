import { FieldType, Role, ViewType } from "@teable/core";
import type {
  IEnableShareViewVo,
  IGetCollaboratorsResponse,
  IShareViewCollaboratorsVo,
  IUserMeVo,
} from "@teable/openapi";
import {
  ADD_BASE_COLLABORATOR,
  BASE_COLLABORATE_LIST,
  BillingProductLevel,
  ENABLE_SHARE_VIEW,
  PrincipalType,
  SHARE_VIEW_COLLABORATORS,
  USER_ME,
  axios,
  urlBuilder,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import {
  createBase,
  createSpace,
  createTable,
  createView,
  permanentDeleteBase,
  permanentDeleteSpace,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DepartmentShareUserPickerCaseConfig } from "../types";

const ADD_DEPARTMENT_USER = "/organization/{organizationId}/department-user";
const ADD_ORGANIZATION_USER = "/organization/{organizationId}/user";
const CREATE_DEPARTMENT = "/organization/{organizationId}/department";
const CREATE_MANUAL_SUBSCRIPTION = "billing/subscription/manual";
const DELETE_MANUAL_SUBSCRIPTION =
  "billing/subscription/manual/{subscriptionId}";

interface DepartmentResponse {
  id: string;
  name: string;
}

interface ManualSubscriptionResponse {
  id: string;
  resourceId: string;
}

export const runDepartmentShareUserPickerCase = async (
  bugCase: BugCaseFor<"department-share-user-picker">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DepartmentShareUserPickerCaseConfig = bugCase.config;
  const suffix = context.runId;
  let spaceId = "";
  let baseId = "";
  let tableId = "";
  let subscriptionId = "";

  try {
    const owner = (await axios.get<IUserMeVo>(USER_ME)).data;
    const ownerDomain = owner.email.split("@")[1];
    if (!ownerDomain) {
      throw new Error(
        `owner email ${JSON.stringify(owner.email)} has no domain`,
      );
    }
    const memberEmail = `${config.memberNamePrefix}-${suffix}@${ownerDomain}`;
    const memberAxios = await createNewUserAxios({
      email: memberEmail,
      password: "12345678a",
    });
    const member = (await memberAxios.get<IUserMeVo>(USER_ME)).data;

    const space = await createSpace({
      name: `${config.spaceNamePrefix}-${suffix}`,
    });
    spaceId = space.id;
    const subscription = await axios.post<ManualSubscriptionResponse>(
      CREATE_MANUAL_SUBSCRIPTION,
      {
        relateId: spaceId,
        catalog: "cloud",
        type: "base",
        level: BillingProductLevel.Enterprise,
        quantity: 3,
        currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
        email: owner.email,
        organizationName: `${config.spaceNamePrefix}-${suffix}`,
      },
    );
    subscriptionId = subscription.data.id;
    const organizationId = subscription.data.resourceId;

    const department = await axios.post<DepartmentResponse>(
      urlBuilder(CREATE_DEPARTMENT, { organizationId }),
      { name: `${config.departmentNamePrefix}-${suffix}` },
    );
    await axios.post(urlBuilder(ADD_ORGANIZATION_USER, { organizationId }), {
      emails: [memberEmail],
    });
    await axios.post<void>(
      urlBuilder(ADD_DEPARTMENT_USER, { organizationId }),
      {
        departmentIds: [department.data.id],
        userIds: [member.id],
      },
    );

    const base = await createBase({
      name: `${config.baseNamePrefix}-${suffix}`,
      spaceId,
    });
    baseId = base.id;
    await axios.post<void>(urlBuilder(ADD_BASE_COLLABORATOR, { baseId }), {
      collaborators: [
        {
          principalId: department.data.id,
          principalType: PrincipalType.Department,
        },
      ],
      role: Role.Editor,
    });

    // Fixture verification: the member is not a direct base collaborator. The
    // department is the only path by which this user can reach the base.
    const direct = await axios.get<IGetCollaboratorsResponse>(
      urlBuilder(BASE_COLLABORATE_LIST, { baseId }),
    );
    const directMember = direct.data.collaborators.some((collaborator) => {
      const item = collaborator as {
        type?: PrincipalType;
        userId?: string;
        principalId?: string;
      };
      return (
        item.type === PrincipalType.User &&
        (item.userId === member.id || item.principalId === member.id)
      );
    });
    if (directMember) {
      throw new Error(
        `member ${member.id} is already a direct base collaborator; the department-only fixture is not in place`,
      );
    }

    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${suffix}`,
      fields: [
        { name: "Title", type: FieldType.SingleLineText, isPrimary: true },
        { name: "Owner", type: FieldType.User },
      ],
      records: [],
    });
    tableId = table.id;
    const form = await createView(tableId, {
      name: "Shared form",
      type: ViewType.Form,
    });
    const share = await axios.post<IEnableShareViewVo>(
      urlBuilder(ENABLE_SHARE_VIEW, { tableId, viewId: form.id }),
    );

    // This is the exact response used by the shared picker. Route proof stays
    // outside the checkpoint so a harness fallback cannot be mistaken for the
    // historical directory bug; the response body is checked inside it.
    const searched = await axios.get<IShareViewCollaboratorsVo>(
      urlBuilder(SHARE_VIEW_COLLABORATORS, {
        shareId: share.data.shareId,
      }),
      { params: { search: member.name, take: 50 } },
    );
    const routing = assertServedByV2(searched.headers, {
      feature: "getSharedViewCollaborators",
      operation: "searching the shared user picker",
    });

    const probe = await bugCheckpoint(
      "department-member-is-searchable-in-shared-user-picker",
      () => {
        const match = searched.data.find(
          (candidate) => candidate.userId === member.id,
        );
        if (!match) {
          throw new Error(
            `searching for ${JSON.stringify(member.name)} returned ${JSON.stringify(
              searched.data.map((candidate) => ({
                userId: candidate.userId,
                userName: candidate.userName,
              })),
            )}; department-only member ${member.id} is missing`,
          );
        }
        if (match.userName !== member.name) {
          throw new Error(
            `member ${member.id} is named ${JSON.stringify(match.userName)} in the picker, expected ${JSON.stringify(member.name)}`,
          );
        }
        if (searched.data.some((candidate) => "email" in candidate)) {
          throw new Error(
            `the shared picker exposed an email address: ${JSON.stringify(searched.data)}`,
          );
        }
        return { match };
      },
    );

    return {
      details: {
        spaceId,
        baseId,
        tableId,
        departmentId: department.data.id,
        memberId: member.id,
        matchedUser: probe.match,
        routing,
      },
    };
  } finally {
    if (tableId && baseId) {
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
    if (baseId) {
      try {
        await permanentDeleteBase(baseId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (base ${baseId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
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
    if (subscriptionId) {
      try {
        await axios.delete(
          urlBuilder(DELETE_MANUAL_SUBSCRIPTION, { subscriptionId }),
          {
            params: { catalog: "cloud" },
          },
        );
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (subscription ${subscriptionId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
