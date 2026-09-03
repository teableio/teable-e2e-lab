import { FieldKeyType, FieldType } from "@teable/core";
import { ARCHIVE_RECORDS, GET_RECORDS_URL, urlBuilder } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { withRestrictedPerson } from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ArchiveGrantedByTheMatrixCaseConfig } from "../types";

// Somebody whose role grants archiving -> archive a row the role lets them see
// -> checkpoint: the row is archived.
//
// Giving somebody a role in the authority matrix also puts them in the base, and
// it puts them in as a Viewer. A Viewer, by their base role alone, may not
// archive anything. The role says they may.
//
// Two gates read those two answers, and the wrong one went first: the base role
// was checked before the matrix, so the answer was always the Viewer's. The
// person was refused an action their role had been given, and the refusal said
// only that they lack permission - naming neither the role that grants it nor
// the base role that withholds it. From the settings screen everything looks
// correctly configured, because it is.
//
// The report describes this in a grouped and sorted view. That was incidental;
// the fix says so and this fixture leaves it out.
//
// Archiving OUTSIDE the role's rows is asked too, and must still be refused.
// That half never goes red - being refused everything is also being refused
// this - but it is what separates the fix from simply opening the gate.

const NAME_FIELD = "Name";
const TEAM_FIELD = "Team";

export const runArchiveGrantedByTheMatrixCase = async (
  bugCase: BugCaseFor<"archive-granted-by-the-matrix">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ArchiveGrantedByTheMatrixCaseConfig = bugCase.config;
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

  try {
    person = await withRestrictedPerson({
      namePrefix: config.tableNamePrefix,
      runId: context.runId,
      // Through the role alone, so they arrive as a Viewer. Invited as an
      // editor first, their base role would allow archiving on its own and the
      // gate that read it would answer correctly by accident.
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

        // Nothing withheld: archiving is granted. Rows are scoped, so there is
        // something the role does not reach.
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

    const archiveAs = async (recordIds: string[]) =>
      person!.axios.post(
        urlBuilder(ARCHIVE_RECORDS, { tableId }),
        { recordIds },
        { validateStatus: () => true },
      );

    // Fixture verification, outside the checkpoint: the person sees exactly the
    // rows their role lets them see. If they saw none, a refusal below would be
    // about reaching the table at all rather than about archiving.
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
          `their role scopes them to - the fixture is not in place`,
      );
    }
    const routing = assertServedByV2(visible.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-role-that-grants-archiving-lets-them-archive",
      async () => {
        const target = idByName.get(inScope[0].name) as string;
        const granted = await archiveAs([target]);
        const body =
          typeof granted.data === "string"
            ? granted.data
            : JSON.stringify(granted.data ?? "");

        if (granted.status < 200 || granted.status >= 300) {
          throw new Error(
            `archiving a row the role lets them see answered ${granted.status}: ${body}. ` +
              `They arrived in the base through the role, which joins them as a Viewer, and a Viewer ` +
              `may not archive - so the answer is the base role's rather than the role's`,
          );
        }
        const archived =
          (granted.data as { archivedRecordIds?: string[] })
            ?.archivedRecordIds ?? [];
        if (!archived.includes(target)) {
          throw new Error(
            `archiving answered ${granted.status} but reported ${JSON.stringify(archived)}: ${body}`,
          );
        }

        // The other half: what the role does not reach is still refused. This
        // never goes red - being refused everything is also being refused this -
        // and it is what separates the fix from opening the gate.
        const beyond = await archiveAs([
          idByName.get(outOfScope[0].name) as string,
        ]);
        if (beyond.status >= 200 && beyond.status < 300) {
          throw new Error(
            `archiving a row OUTSIDE the role's rows was allowed (${beyond.status}): ` +
              (typeof beyond.data === "string"
                ? beyond.data
                : JSON.stringify(beyond.data)),
          );
        }
        return { archived, refusedBeyond: beyond.status };
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
