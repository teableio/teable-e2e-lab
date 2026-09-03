import { FieldKeyType, FieldType, SortFunc } from "@teable/core";
import { GET_RECORDS_URL, urlBuilder } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { withRestrictedPerson } from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { GroupOnAnUnreadableColumnCaseConfig } from "../types";

// A grid grouped by a column the person opening it may not read -> open it ->
// checkpoint: the rows come back.
//
// Under the authority matrix a role can withhold a single column. The rest of
// the table is still theirs to read - that is the whole point of withholding
// one column rather than the table.
//
// But a view remembers what it is grouped by, and the page sends that grouping
// with every request for rows. Asked to group by a column the reader may not
// see, the server refused the request outright, so what the person got was not
// a view without its grouping - it was a view with NO ROWS AT ALL and a message
// about a data validation error. Nothing in it names the column, and nothing
// suggests the grouping is the thing to change. An administrator opening the
// same view sees everything, which is the worst possible shape for a support
// conversation.
//
// The same request without the grouping is read first, outside the checkpoint.
// That is the control: it says the person can read this table, so a refusal
// afterwards is about the grouping and not about them.

const NAME_FIELD = "Name";
const OPEN_FIELD = "Stage";
const WITHHELD_FIELD = "Owner cost";

export const runGroupOnAnUnreadableColumnCase = async (
  bugCase: BugCaseFor<"group-on-an-unreadable-column">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: GroupOnAnUnreadableColumnCaseConfig = bugCase.config;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let person: Awaited<ReturnType<typeof withRestrictedPerson>> | undefined;
  let tableId = "";
  let withheldFieldId = "";
  let openFieldId = "";

  if (config.rows.length < 2) {
    throw new Error(
      "at least two rows, or a request that returns nothing looks the same as one that returns everything",
    );
  }

  try {
    person = await withRestrictedPerson({
      namePrefix: config.tableNamePrefix,
      runId: context.runId,
      buildTables: async (baseId) => {
        const table = await createTable(baseId, {
          name: suffix,
          fields: [
            {
              name: NAME_FIELD,
              type: FieldType.SingleLineText,
              isPrimary: true,
            },
            { name: OPEN_FIELD, type: FieldType.SingleLineText },
            { name: WITHHELD_FIELD, type: FieldType.Number },
          ],
          records: config.rows.map((row) => ({
            fields: {
              [NAME_FIELD]: row.name,
              [OPEN_FIELD]: row.stage,
              [WITHHELD_FIELD]: row.cost,
            },
          })),
        });
        tableId = table.id;
        withheldFieldId = table.fields.find(
          (field: { name: string }) => field.name === WITHHELD_FIELD,
        )?.id as string;
        openFieldId = table.fields.find(
          (field: { name: string }) => field.name === OPEN_FIELD,
        )?.id as string;
        if (!withheldFieldId || !openFieldId) {
          throw new Error("the table is not in place");
        }

        // One column withheld, and only one. Everything else stays readable, so
        // the person can open the table at all.
        return [
          {
            tableId: table.id,
            fieldRecordPermission: [
              {
                fieldId: withheldFieldId,
                disabledActions: [
                  "record|read",
                  "record|update",
                  "record|create",
                ],
              },
            ],
          },
        ];
      },
    });

    const readAs = async (groupBy?: unknown) =>
      person!.axios.get(urlBuilder(GET_RECORDS_URL, { tableId }), {
        params: {
          fieldKeyType: FieldKeyType.Id,
          take: config.rows.length,
          ...(groupBy ? { groupBy: JSON.stringify(groupBy) } : {}),
        },
        validateStatus: () => true,
      });

    // Fixture verification, outside the checkpoint. Two things have to be true
    // before the grouped request means anything: the person can read the table,
    // and the withheld column really is withheld from them. Without the second,
    // grouping by it would be an ordinary request and the case would report on
    // nothing.
    const plain = await readAs();
    if (plain.status !== 200) {
      throw new Error(
        `the restricted person cannot read the table at all (${plain.status}): ${JSON.stringify(plain.data)}`,
      );
    }
    const plainRows =
      (plain.data as { records?: { fields: Record<string, unknown> }[] })
        ?.records ?? [];
    if (plainRows.length !== config.rows.length) {
      throw new Error(
        `the restricted person sees ${plainRows.length} of ${config.rows.length} rows - ` +
          "this case is about a withheld column, not withheld rows",
      );
    }
    if (plainRows.some((row) => row.fields[withheldFieldId] !== undefined)) {
      throw new Error(
        `the withheld column came back to the restricted person: ${JSON.stringify(plainRows[0]?.fields)} - ` +
          "the role is not withholding it, so grouping by it is an ordinary request",
      );
    }
    const routing = assertServedByV2(plain.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-grid-grouped-by-a-column-you-cannot-read-still-shows-its-rows",
      async () => {
        const grouped = await readAs([
          { fieldId: withheldFieldId, order: SortFunc.Asc },
        ]);
        const body =
          typeof grouped.data === "string"
            ? grouped.data
            : JSON.stringify(grouped.data ?? "");

        if (grouped.status !== 200) {
          throw new Error(
            `opening the grid grouped by a column the person may not read answered ${grouped.status}, ` +
              `so the whole view has no rows rather than no grouping: ${body}`,
          );
        }
        const rows =
          (grouped.data as { records?: { id: string }[] })?.records ?? [];
        if (rows.length !== config.rows.length) {
          throw new Error(
            `the grouped request answered 200 but returned ${rows.length} of ${config.rows.length} rows: ${body}`,
          );
        }
        return { rows: rows.length };
      },
    );

    return {
      details: {
        baseId: person.baseId,
        tableId,
        withheldFieldId,
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
