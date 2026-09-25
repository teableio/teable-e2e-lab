import { FieldKeyType, FieldType } from "@teable/core";
import { GET_RECORDS_URL, GET_ROW_COUNT, urlBuilder } from "@teable/openapi";
import { createTable } from "../../../utils/init-app";
import {
  withRestrictedPerson,
  type RestrictedTableRule,
} from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { MultiRoleSearchScopeCaseConfig } from "../types";

// A person holding several roles, each limiting which rows they see -> search
// the table with "hide rows that do not match" on -> checkpoint: only rows
// containing the keyword come back.
//
// Holding more than one role widens what a person sees: a row visible to any
// of their roles is visible to them. Put together, that is "role A's rows OR
// role B's rows". The search was then added as "AND contains the keyword" -
// without brackets, so it read "A OR (B AND keyword)". Every row role A could
// see came back whether it matched or not. The count of matching rows beside
// the search box was right, and the grid showed more rows than it said.
//
// Three roles rather than the two reported: the scopes are joined left to
// right, and with two the leak depends on which comes first. With three, the
// unbracketed part always includes a role that sees every row, so the leak
// does not depend on the order the roles come back in.

const SEARCH_FIELD_INDEX = 5;
const PICK_FIELD_INDEX = 2;

const fieldName = (index: number) => `F${index}`;

export const runMultiRoleSearchScopeCase = async (
  bugCase: BugCaseFor<"multi-role-search-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: MultiRoleSearchScopeCaseConfig = bugCase.config;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let person: Awaited<ReturnType<typeof withRestrictedPerson>> | undefined;
  let tableId = "";
  let viewId = "";
  let fieldIds: string[] = [];
  let recordIds: string[] = [];

  if (config.roles.length < 2) {
    throw new Error("one role merges nothing - two roles at least");
  }
  const rowCount = config.matchingRows + 1;

  try {
    const ruleFor = (role: (typeof config.roles)[number]) => [
      {
        tableId,
        recordFilter: {
          conjunction: "and" as const,
          filterSet: [
            {
              fieldId: fieldIds[role.fieldIndex - 1] as string,
              operator: role.operator,
              value: role.value,
            },
          ],
        },
      } satisfies RestrictedTableRule,
    ];

    person = await withRestrictedPerson({
      namePrefix: config.tableNamePrefix,
      runId: context.runId,
      buildTables: async (baseId) => {
        // Every row but the last holds the keyword; every row satisfies the
        // "isNot deny" roles; one row satisfies the narrow role.
        const table = await createTable(baseId, {
          name: suffix,
          fields: Array.from({ length: config.fieldCount }, (_, index) => ({
            name: fieldName(index + 1),
            type: FieldType.SingleLineText,
          })),
          records: Array.from({ length: rowCount }, (_, rowIndex) => {
            const row = rowIndex + 1;
            const fields: Record<string, string> = {};
            for (let column = 1; column <= config.fieldCount; column += 1) {
              fields[fieldName(column)] = `v${row}_${column}`;
            }
            fields[fieldName(PICK_FIELD_INDEX)] = `b${row}`;
            fields[fieldName(SEARCH_FIELD_INDEX)] =
              row < rowCount ? config.keyword : "other";
            for (const role of config.roles) {
              if (role.operator === "isNot") {
                fields[fieldName(role.fieldIndex)] = "ok";
              }
            }
            return { fields };
          }),
        });
        tableId = table.id;
        viewId = table.defaultViewId ?? table.views?.[0]?.id ?? "";
        fieldIds = table.fields.map((field: { id: string }) => field.id);
        recordIds = (table.records ?? []).map(
          (record: { id: string }) => record.id,
        );
        if (!viewId || recordIds.length !== rowCount) {
          throw new Error(`Table ${tableId} is not in place`);
        }
        return ruleFor(config.roles[0]!);
      },
      additionalRoles: () => config.roles.slice(1).map(ruleFor),
    });
    const restricted = person;
    const matching = recordIds.slice(0, config.matchingRows).sort();
    const search = [config.keyword, "", true];

    // Fixture verification, outside the checkpoint: the person can read the
    // table, and the count of matching rows is right. That count was right on
    // both sides of the fix, and it is what the grid's row list contradicts.
    const counted = await restricted.axios.get(
      urlBuilder(GET_ROW_COUNT, { tableId }),
      { params: { viewId, search } },
    );
    if (counted.data?.rowCount !== config.matchingRows) {
      throw new Error(
        `the row count for "${config.keyword}" reads ${JSON.stringify(counted.data)}, expected ` +
          `${config.matchingRows} - the roles are not scoping the table as declared`,
      );
    }

    const probe = await bugCheckpoint(
      "a-multi-role-search-returns-only-matching-rows",
      async () => {
        const response = await restricted.axios.get(
          urlBuilder(GET_RECORDS_URL, { tableId }),
          { params: { viewId, search, fieldKeyType: FieldKeyType.Id } },
        );
        const routing = assertServedByV2(response.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const returned = (response.data.records as { id: string }[])
          .map((record) => record.id)
          .sort();
        if (JSON.stringify(returned) !== JSON.stringify(matching)) {
          const extra = returned.filter((id) => !matching.includes(id));
          throw new Error(
            `searching for "${config.keyword}" with non-matching rows hidden returned ${returned.length} rows, ` +
              `expected the ${matching.length} that contain it; ${extra.length} returned rows do not ` +
              `(${JSON.stringify(extra)}), while the row count beside the search reads ${config.matchingRows}`,
          );
        }
        return { routing, returned };
      },
    );

    return {
      details: {
        tableId,
        join: restricted.join,
        roleIds: [restricted.roleId, ...restricted.additionalRoleIds],
        routing: probe.routing,
        returned: probe.returned,
      },
    };
  } finally {
    if (person) {
      try {
        await person.cleanUp();
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${person.spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
