import { FieldKeyType, FieldType, Relationship, Role } from "@teable/core";
import type { IUserMeVo } from "@teable/openapi";
import {
  createRecords as apiCreateRecords,
  emailBaseInvitation,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  LookupUserRecomputeRereadCaseConfig,
} from "../types";

const TITLE_FIELD = "Title";
const USER_FIELD = "Owner";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const userIds = (cell: unknown): string[] => {
  const values = Array.isArray(cell) ? cell : cell == null ? [] : [cell];
  return values
    .map((value) =>
      typeof value === "object" && value && "id" in value
        ? String((value as { id: unknown }).id)
        : "",
    )
    .filter(Boolean)
    .sort();
};

export const runLookupUserRecomputeRereadCase = async (
  bugCase: BugCaseFor<"lookup-user-recompute-reread">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupUserRecomputeRereadCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];

  try {
    const replacementEmail = `${suffix}@example.com`;
    const replacementAxios = await createNewUserAxios({
      email: replacementEmail,
      password: "12345678a",
    });
    const replacement = (await replacementAxios.get<IUserMeVo>(USER_ME)).data;
    await emailBaseInvitation({
      baseId,
      emailBaseInvitationRo: {
        emails: [replacementEmail],
        role: Role.Editor,
      },
    });

    const source = await createTable(baseId, {
      name: `${suffix}-owners`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: USER_FIELD,
          type: FieldType.User,
          options: { isMultiple: false, shouldNotify: false },
        },
      ],
      records: [],
    });
    tableIds.unshift(source.id);
    const ownerField = source.fields.find((field) => field.name === USER_FIELD);
    if (!ownerField) {
      throw new Error("the source user field is missing");
    }
    const sourceRows = await apiCreateRecords(source.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        {
          fields: {
            [source.fields[0].id]: config.sourceTitle,
            [ownerField.id]: {
              id: globalThis.testConfig.userId,
              title: globalThis.testConfig.userName,
            },
          },
        },
      ],
    });
    const sourceRecordId = sourceRows.data.records[0]?.id;
    if (!sourceRecordId) {
      throw new Error("the source owner row did not land");
    }

    const host = await createTable(baseId, {
      name: `${suffix}-work`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [TITLE_FIELD]: config.hostTitle } }],
    });
    tableIds.unshift(host.id);
    const hostRecordId = host.records?.[0]?.id;
    if (!hostRecordId) {
      throw new Error("the host row did not land");
    }

    const link = await createField(host.id, {
      name: "Owners",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: source.id,
      },
    });
    await apiUpdateRecord(host.id, hostRecordId, {
      fieldKeyType: FieldKeyType.Id,
      record: { fields: { [link.id]: [{ id: sourceRecordId }] } },
    });
    const lookup = await createField(host.id, {
      name: "Owner Lookup",
      type: FieldType.User,
      isLookup: true,
      lookupOptions: {
        foreignTableId: source.id,
        linkFieldId: link.id,
        lookupFieldId: ownerField.id,
      },
    });

    const fixtureRead = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 1,
    });
    const routing = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const linkCell = fixtureRead.data.records.find(
      (record) => record.id === hostRecordId,
    )?.fields[link.id];
    if (!Array.isArray(linkCell) || linkCell.length !== 1) {
      throw new Error("the host row is not linked to its source owner row");
    }

    const readLookup = async () => {
      const response = await apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      assertServedByV2(response.headers, {
        operation: "GET /table/{tableId}/record",
        feature: "getRecords",
      });
      const cell = response.data.records.find(
        (record) => record.id === hostRecordId,
      )?.fields[lookup.id];
      return userIds(cell);
    };

    const probe = await bugCheckpoint(
      "recomputed-user-lookup-survives-independent-rereads",
      async () => {
        const expectedInitial = [globalThis.testConfig.userId];
        const first = await readLookup();
        const second = await readLookup();
        if (
          JSON.stringify(first) !== JSON.stringify(expectedInitial) ||
          JSON.stringify(second) !== JSON.stringify(expectedInitial)
        ) {
          throw new Error(
            `independent reads returned ${JSON.stringify(first)} and ${JSON.stringify(second)}, expected ${JSON.stringify(expectedInitial)}`,
          );
        }

        await apiUpdateRecord(source.id, sourceRecordId, {
          fieldKeyType: FieldKeyType.Id,
          record: {
            fields: {
              [ownerField.id]: {
                id: replacement.id,
                title: replacement.name,
                email: replacement.email,
              },
            },
          },
        });

        const expectedReplacement = [replacement.id];
        const deadline = Date.now() + config.settleTimeoutMs;
        let after: string[] = [];
        for (;;) {
          after = await readLookup();
          if (JSON.stringify(after) === JSON.stringify(expectedReplacement)) {
            break;
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `after recomputation the lookup returned ${JSON.stringify(after)}, expected ${JSON.stringify(expectedReplacement)}`,
            );
          }
          await sleep(config.pollIntervalMs);
        }

        const reread = await readLookup();
        if (JSON.stringify(reread) !== JSON.stringify(expectedReplacement)) {
          throw new Error(
            `the recomputed lookup reread as ${JSON.stringify(reread)}, expected ${JSON.stringify(expectedReplacement)}`,
          );
        }
        const described = await getField(host.id, lookup.id);
        if (described.isMultipleCellValue !== true) {
          throw new Error(
            `the recomputed one-to-many user lookup is described as isMultipleCellValue=${JSON.stringify(described.isMultipleCellValue)}, expected true`,
          );
        }
        return { first, second, after, reread };
      },
    );

    return {
      details: {
        sourceTableId: source.id,
        hostTableId: host.id,
        replacementUserId: replacement.id,
        firstRead: probe.first,
        secondRead: probe.second,
        recomputedRead: probe.after,
        refreshedRead: probe.reread,
        routing,
      },
    };
  } finally {
    for (const tableId of tableIds) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
};
