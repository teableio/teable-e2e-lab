import { FieldKeyType, FieldType, Role } from "@teable/core";
import {
  axios,
  emailBaseInvitation,
  UPDATE_USER_NAME,
  USER_ME,
} from "@teable/openapi";
import type { IUserMeVo } from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import {
  createTable,
  getRecord,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  CreatedByToTextCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A "created by" column with rows created by two people, one of whom has a
// comma in their name -> convert the column to plain text -> checkpoint: each
// row holds its creator's name as text, and the name with a comma is quoted.
//
// Converting "who added this" to text is how people keep the names when the
// accounts behind them will go. The conversion answered 200 and left every
// cell empty. Once names did come through, a name like "Li, Lei" came through
// bare - and in a column whose text is read back as a list of names, that is
// two people, "Li" and "Lei", neither of whom exists. Quoting it is the
// product's own rule for keeping one name one name.

const NAME_FIELD = "Name";
const CREATOR_FIELD = "Creator";

export const runCreatedByToTextCase = async (
  bugCase: BugCaseFor<"created-by-to-text">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CreatedByToTextCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  if (!config.secondCreatorName.includes(",")) {
    throw new Error(
      "the second creator's name has to contain a comma, or quoting is never exercised",
    );
  }

  try {
    const owner = (await axios.get<IUserMeVo>(USER_ME)).data;
    const email = `${config.tableNamePrefix}-${context.runId}@example.com`;
    const secondAxios = await createNewUserAxios({
      email,
      password: "12345678a",
    });
    await secondAxios.patch(UPDATE_USER_NAME, {
      name: config.secondCreatorName,
    });
    try {
      await emailBaseInvitation({
        baseId,
        emailBaseInvitationRo: { emails: [email], role: Role.Editor },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exist/i.test(message)) {
        throw error;
      }
    }

    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CREATOR_FIELD, type: FieldType.CreatedBy },
      ],
      records: [{ fields: { [NAME_FIELD]: "by-owner" } }],
    });
    tableIds.push(table.id);
    const creatorId = table.fields.find(
      (field: { name: string }) => field.name === CREATOR_FIELD,
    )?.id;
    if (!creatorId) {
      throw new Error(`table ${table.id} has no ${CREATOR_FIELD} column`);
    }
    const ownerRowId = table.records[0].id;
    const created = await secondAxios.post<{ records: { id: string }[] }>(
      `/table/${table.id}/record`,
      {
        fieldKeyType: FieldKeyType.Name,
        records: [{ fields: { [NAME_FIELD]: "by-second" } }],
      },
    );
    const secondRowId = created.data.records[0].id;

    // Both rows have to name their creators before the conversion.
    const titleOf = async (recordId: string) =>
      (
        (await getRecord(table.id, recordId)).fields[creatorId] as
          | { title?: string }
          | undefined
      )?.title;
    const ownerTitle = await titleOf(ownerRowId);
    const secondTitle = await titleOf(secondRowId);
    if (!ownerTitle || secondTitle !== config.secondCreatorName) {
      throw new Error(
        `before the conversion the rows name ${JSON.stringify(ownerTitle)} and ${JSON.stringify(secondTitle)}, ` +
          `expected the owner (${owner.name}) and ${config.secondCreatorName}`,
      );
    }
    const expectedText = (name: string) =>
      name.includes(",") ? `"${name}"` : name;

    const probe = await bugCheckpoint(
      "a-creator-converted-to-text-keeps-one-name-per-person",
      async () => {
        const converted = await rawRequest(
          "PUT",
          `/table/${table.id}/field/${creatorId}/convert`,
          { type: FieldType.SingleLineText },
        );
        if (!isSuccess(converted)) {
          throw new Error(
            `converting the creator column to text answered ${describeResponse(converted)}`,
          );
        }
        const routing = assertServedByV2(converted.headers, {
          operation: "PUT /table/{tableId}/field/{fieldId}/convert",
          feature: "convertField",
        });
        const after = {
          owner:
            (await getRecord(table.id, ownerRowId)).fields[creatorId] ?? null,
          second:
            (await getRecord(table.id, secondRowId)).fields[creatorId] ?? null,
        };
        const expected = {
          owner: expectedText(ownerTitle),
          second: expectedText(config.secondCreatorName),
        };
        if (JSON.stringify(after) !== JSON.stringify(expected)) {
          throw new Error(
            `after converting to text the rows read ${JSON.stringify(after)}, expected ${JSON.stringify(expected)}`,
          );
        }
        return { routing, after };
      },
    );

    return { details: { tableId: table.id, after: probe.after } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
