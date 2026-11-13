import { FieldKeyType, FieldType } from "@teable/core";
import { USER_ME } from "@teable/openapi";
import type { IUserMeVo } from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  UserConversionCollaboratorsOnlyCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A text column holding two email addresses: the seed user's, who works in
// the base, and a person signed up for this run who has never been invited
// -> convert the column to a user field -> checkpoint: the collaborator's row
// becomes that user, the outsider's row stays empty.
//
// Converting text to users looked every value up among all accounts on the
// instance, not among the people who can see the base. Typing any address
// into a column and converting it turned a stranger into a cell value, with
// their name and avatar shown to everyone in the base - and confirmed that
// the address has an account.

const NAME = "Name";
const CONTACT = "Contact";

export const runUserConversionCollaboratorsOnlyCase = async (
  bugCase: BugCaseFor<"user-conversion-collaborators-only">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserConversionCollaboratorsOnlyCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const outsiderEmail =
      `${config.tableNamePrefix}-${context.runId}@example.com`.toLowerCase();
    const outsiderClient = await createNewUserAxios({
      email: outsiderEmail,
      password: "12345678a",
    });
    const outsider = (await outsiderClient.get<IUserMeVo>(USER_ME)).data;
    const memberEmail = globalThis.testConfig.email;
    const memberId = globalThis.testConfig.userId;

    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        { name: CONTACT, type: FieldType.SingleLineText },
      ],
      records: [
        { fields: { [NAME]: "member", [CONTACT]: memberEmail } },
        { fields: { [NAME]: "outsider", [CONTACT]: outsiderEmail } },
      ],
    });
    tableIds.push(table.id);
    const contactId = table.fields[1].id;

    const probe = await bugCheckpoint(
      "converting-text-to-users-matches-only-collaborators",
      async () => {
        const converted = await rawRequest(
          "PUT",
          `/table/${table.id}/field/${contactId}/convert`,
          {
            type: FieldType.User,
            options: { isMultiple: false, shouldNotify: false },
          },
        );
        if (!isSuccess(converted)) {
          throw new Error(
            `converting the column to users answered ${describeResponse(converted)}`,
          );
        }
        const read = await rawRequest<{
          records: { fields: Record<string, unknown> }[];
        }>(
          "GET",
          `/table/${table.id}/record?fieldKeyType=${FieldKeyType.Name}`,
        );
        const cell = (row: string) =>
          (read.data.records ?? []).find(
            (record) => record.fields[NAME] === row,
          )?.fields[CONTACT] as { id?: string } | undefined;
        const member = cell("member");
        const stranger = cell("outsider");
        const problems: string[] = [];
        if (stranger) {
          problems.push(
            `the outsider's row became ${stranger.id === outsider.id ? "the outsider's account" : JSON.stringify(stranger)}, though they cannot see the base`,
          );
        }
        if (member?.id !== memberId) {
          problems.push(
            `the collaborator's row became ${JSON.stringify(member)}, expected the collaborator`,
          );
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { memberResolved: true, outsiderResolved: false };
      },
    );
    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
