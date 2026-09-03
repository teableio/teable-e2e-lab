import { FieldKeyType, FieldType } from "@teable/core";
import {
  CREATE_COMMENT,
  GET_COMMENT_LIST,
  GET_RECORDS_URL,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { withRestrictedPerson } from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CommentGrantedByTheMatrixCaseConfig } from "../types";

// Somebody whose role lets them comment -> leave a comment on a row the role
// lets them see -> checkpoint: the comment is saved, and it is in the thread.
//
// Giving somebody a role in the authority matrix also puts them in the base, as
// a Viewer. A Viewer, by their base role alone, may not comment. The role says
// they may.
//
// Commenting was gated on the base role alone, so the role's grant never
// reached the write and every comment was refused as a restricted resource. The
// person can see the record, can open it, can read the thread - and cannot add
// to it, with a message about permissions that names nothing they can change.
//
// Commenting on a row the role does NOT reach is asked too, and must still be
// refused. That half never goes red - being refused everywhere is also being
// refused there - and it is what separates the fix from removing the gate: the
// same change also had to bound commenting by the role's row conditions, which
// the base-role path never applied.

const NAME_FIELD = "Name";
const TEAM_FIELD = "Team";

export const runCommentGrantedByTheMatrixCase = async (
  bugCase: BugCaseFor<"comment-granted-by-the-matrix">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CommentGrantedByTheMatrixCaseConfig = bugCase.config;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let person: Awaited<ReturnType<typeof withRestrictedPerson>> | undefined;
  let tableId = "";
  const idByName = new Map<string, string>();

  const inScope = config.rows.filter((row) => row.team === config.allowedTeam);
  const outOfScope = config.rows.filter(
    (row) => row.team !== config.allowedTeam,
  );
  if (inScope.length === 0 || outOfScope.length === 0) {
    throw new Error(
      "the fixture needs a row the role lets them see and one it does not - without the second, " +
        "'refused outside the role' cannot be told from 'refused everywhere'",
    );
  }

  const comment = (value: string) => ({
    content: [{ type: "p", children: [{ type: "span", value }] }],
  });

  try {
    person = await withRestrictedPerson({
      namePrefix: config.tableNamePrefix,
      runId: context.runId,
      // Through the role alone, so they arrive as a Viewer - the base role that
      // withholds commenting is the whole point.
      join: "throughTheRoleAlone",
      buildTables: async (baseId) => {
        const table = await createTable(baseId, {
          name: suffix,
          fields: [
            {
              name: NAME_FIELD,
              type: FieldType.SingleLineText,
              isPrimary: true,
            },
            { name: TEAM_FIELD, type: FieldType.SingleLineText },
          ],
          records: config.rows.map((row) => ({
            fields: { [NAME_FIELD]: row.name, [TEAM_FIELD]: row.team },
          })),
        });
        tableId = table.id;
        for (const record of table.records as {
          id: string;
          fields: Record<string, unknown>;
        }[]) {
          idByName.set(String(record.fields[NAME_FIELD]), record.id);
        }
        const teamFieldId = table.fields.find(
          (field: { name: string }) => field.name === TEAM_FIELD,
        )?.id as string;

        return [
          {
            tableId: table.id,
            disabledActions: [],
            recordFilter: {
              conjunction: "and",
              filterSet: [
                {
                  fieldId: teamFieldId,
                  operator: "is",
                  value: config.allowedTeam,
                },
              ],
            },
          },
        ];
      },
    });

    const commentAs = async (recordId: string, value: string) =>
      person!.axios.post(
        urlBuilder(CREATE_COMMENT, { tableId, recordId }),
        comment(value),
        { validateStatus: () => true },
      );

    // Fixture verification, outside the checkpoint: the person sees exactly the
    // rows their role scopes them to. Seeing none, a refusal below would be
    // about reaching the table rather than about commenting.
    const visible = await person.axios.get(
      urlBuilder(GET_RECORDS_URL, { tableId }),
      {
        params: { fieldKeyType: FieldKeyType.Name, take: config.rows.length },
        validateStatus: () => true,
      },
    );
    if (visible.status !== 200) {
      throw new Error(
        `the restricted person cannot read the table (${visible.status}): ${JSON.stringify(visible.data)}`,
      );
    }
    const visibleNames = (
      (visible.data as { records?: { fields: Record<string, unknown> }[] })
        ?.records ?? []
    ).map((record) => String(record.fields[NAME_FIELD]));
    if (visibleNames.length !== inScope.length) {
      throw new Error(
        `the restricted person sees ${JSON.stringify(visibleNames)}, expected the ${inScope.length} row(s) ` +
          "their role scopes them to - the fixture is not in place",
      );
    }
    const routing = assertServedByV2(visible.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-role-that-lets-them-comment-lets-them-comment",
      async () => {
        const target = idByName.get(inScope[0].name) as string;
        const posted = await commentAs(target, config.commentText);
        const body =
          typeof posted.data === "string"
            ? posted.data
            : JSON.stringify(posted.data ?? "");

        if (posted.status < 200 || posted.status >= 300) {
          throw new Error(
            `commenting on a row the role lets them see answered ${posted.status}: ${body}. ` +
              "They arrived in the base through the role, which joins them as a Viewer, and a Viewer " +
              "may not comment - so the answer is the base role's rather than the role's",
          );
        }

        // And it is in the thread. A write that answered and left nothing is the
        // same silence with a friendlier status.
        const thread = await person!.axios.get(
          urlBuilder(GET_COMMENT_LIST, { tableId, recordId: target }),
          { validateStatus: () => true },
        );
        const said = JSON.stringify(thread.data ?? "");
        if (!said.includes(config.commentText)) {
          throw new Error(
            `the comment was accepted but the thread does not carry it: ${said}`,
          );
        }

        // The other half: what the role does not reach is still refused.
        const beyond = await commentAs(
          idByName.get(outOfScope[0].name) as string,
          config.commentText,
        );
        if (beyond.status >= 200 && beyond.status < 300) {
          throw new Error(
            `commenting on a row OUTSIDE the role's rows was allowed (${beyond.status}): ` +
              (typeof beyond.data === "string"
                ? beyond.data
                : JSON.stringify(beyond.data)),
          );
        }
        return { posted: posted.status, refusedBeyond: beyond.status };
      },
    );

    return {
      details: {
        baseId: person.baseId,
        tableId,
        join: person.join,
        roleId: person.roleId,
        routing,
        ...probe,
      },
    };
  } finally {
    if (tableId && person) {
      try {
        await permanentDeleteTable(person.baseId, tableId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (person) {
      try {
        await person.cleanUp();
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${person.spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
