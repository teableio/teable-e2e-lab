import { FieldKeyType, FieldType } from "@teable/core";
import { GET_FIELD_LIST, GET_RECORDS_URL, urlBuilder } from "@teable/openapi";
import { createField, createTable } from "../../../utils/init-app";
import { withRestrictedPerson } from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AuthorityComputedActivityCapabilityCaseConfig } from "../types";

// A worked-out column in a table whose rows a role filters -> the restricted
// person opens the table -> checkpoint: the column arrives saying whether its
// progress may be watched, and their rows still carry its value.
//
// A worked-out column can take a while, and the page shows how far along it is
// by subscribing to the column's progress. Whether somebody may watch that is a
// separate permission from reading the column - a person who sees a filtered
// slice of the rows must not be told about work across all of them.
//
// The description the column arrived with did not carry that permission at all,
// so the page had nothing to decide on and subscribed anyway. The server
// refused, and the refusal did not stay contained: it failed the whole batch
// the page had asked for and put a "this resource is restricted" message on
// screen. The person is looking at a table they are allowed to read.
//
// The cells are asserted alongside the permission. A build that dropped the
// subscription by dropping the column's value as well would satisfy a case that
// only looked at the flag, and would be a worse product.

const SCOPE_FIELD = "Scope";
const FORMULA_FIELD = "Readable formula";

interface FieldSummary {
  id: string;
  computedActivityRead?: boolean;
  recordRead?: boolean;
}

export const runAuthorityComputedActivityCapabilityCase = async (
  bugCase: BugCaseFor<"authority-computed-activity-capability">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AuthorityComputedActivityCapabilityCaseConfig = bugCase.config;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let person: Awaited<ReturnType<typeof withRestrictedPerson>> | undefined;
  let tableId = "";
  let formulaFieldId = "";

  const visibleRows = config.rows.filter(
    (row) => row.scope === config.visibleScope,
  );
  const hiddenRows = config.rows.filter(
    (row) => row.scope !== config.visibleScope,
  );
  if (visibleRows.length === 0 || hiddenRows.length === 0) {
    throw new Error(
      "the rows have to straddle the role's filter - with every row visible the person is not restricted at all, " +
        "and with none the table looks empty for reasons that have nothing to do with this",
    );
  }

  try {
    person = await withRestrictedPerson({
      namePrefix: config.tableNamePrefix,
      runId: context.runId,
      buildTables: async (baseId) => {
        const table = await createTable(baseId, {
          name: suffix,
          fields: [{ name: SCOPE_FIELD, type: FieldType.SingleLineText }],
          records: config.rows.map((row) => ({
            fields: { [SCOPE_FIELD]: row.scope },
          })),
        });
        tableId = table.id;
        const scopeFieldId = table.fields.find(
          (field: { name: string }) => field.name === SCOPE_FIELD,
        )?.id as string;
        if (!scopeFieldId) {
          throw new Error("the table is not in place");
        }
        // The worked-out column, which is the one with progress to watch.
        const formula = await createField(table.id, {
          name: FORMULA_FIELD,
          type: FieldType.Formula,
          options: { expression: `{${scopeFieldId}}` },
        });
        formulaFieldId = formula.id;

        // Rows filtered, nothing else withheld: the person may read this
        // table, they may just not see all of it.
        return [
          {
            tableId: table.id,
            disabledActions: [
              "record|create",
              "record|update",
              "record|delete",
            ],
            recordFilter: {
              conjunction: "and",
              filterSet: [
                {
                  fieldId: scopeFieldId,
                  operator: "is",
                  value: config.visibleScope,
                },
              ],
            },
          },
        ];
      },
    });

    // Fixture verification, outside the checkpoint: the person can read the
    // table, and the role really is keeping rows from them. Without the first
    // every assertion below would be about a table they cannot open; without
    // the second they are not restricted at all and the permission under test
    // has nothing to say.
    const seededRows = await person.axios.get(
      urlBuilder(GET_RECORDS_URL, { tableId }),
      {
        params: { fieldKeyType: FieldKeyType.Id, take: config.rows.length },
        validateStatus: () => true,
      },
    );
    if (seededRows.status !== 200) {
      throw new Error(
        `the restricted person cannot read the table at all (${seededRows.status}): ` +
          JSON.stringify(seededRows.data),
      );
    }
    const seededCount =
      (seededRows.data as { records?: unknown[] })?.records?.length ?? 0;
    if (seededCount !== visibleRows.length) {
      throw new Error(
        `the restricted person sees ${seededCount} rows, expected the ${visibleRows.length} their role's filter ` +
          "allows - the fixture is not restricting them the way the case describes",
      );
    }

    const probe = await bugCheckpoint(
      "a-worked-out-column-says-whether-its-progress-may-be-watched",
      async () => {
        const listed = await person!.axios.get<FieldSummary[]>(
          urlBuilder(GET_FIELD_LIST, { tableId }),
          { validateStatus: () => true },
        );
        if (listed.status !== 200) {
          throw new Error(
            `the restricted person cannot read the table's columns at all (${listed.status}): ` +
              JSON.stringify(listed.data),
          );
        }
        const routing = assertServedByV2(listed.headers, {
          operation: "GET /table/{tableId}/field",
          feature: "getFields",
        });
        const formula = listed.data.find(
          (field) => field.id === formulaFieldId,
        );
        if (!formula) {
          throw new Error(
            `the worked-out column is not in what the restricted person is given: ${JSON.stringify(listed.data)}`,
          );
        }
        if (typeof formula.computedActivityRead !== "boolean") {
          throw new Error(
            `the column arrives as ${JSON.stringify(formula)} - it does not say whether its progress may be ` +
              "watched, so the page has nothing to decide on and subscribes anyway, and the refusal fails the " +
              "whole batch it asked for",
          );
        }
        if (formula.computedActivityRead !== false) {
          throw new Error(
            "the column tells a person who sees a filtered slice of the rows that they may watch progress across " +
              "all of them",
          );
        }

        // The same column, read the way the page reads it when it reconnects.
        const snapshots = await person!.axios.get<{ data: FieldSummary }[]>(
          urlBuilder("/table/{tableId}/field/socket/snapshot-bulk", {
            tableId,
          }),
          { params: { ids: [formulaFieldId] }, validateStatus: () => true },
        );
        if (snapshots.status !== 200 || snapshots.data.length !== 1) {
          throw new Error(
            `reconnecting asks for the column and gets ${snapshots.status}: ${JSON.stringify(snapshots.data)}`,
          );
        }
        const snapshot = snapshots.data[0]?.data;
        if (snapshot?.computedActivityRead !== false) {
          throw new Error(
            `on reconnect the column arrives as ${JSON.stringify(snapshot)}, expected it to say its progress may ` +
              "not be watched - the page decides again on every reconnect",
          );
        }

        // The values, which the permission must not have cost them.
        const records = await person!.axios.get(
          urlBuilder(GET_RECORDS_URL, { tableId }),
          {
            params: {
              fieldKeyType: FieldKeyType.Id,
              take: config.rows.length,
            },
            validateStatus: () => true,
          },
        );
        const rows =
          (records.data as { records?: { fields: Record<string, unknown> }[] })
            ?.records ?? [];
        const seen = rows.map((row) => row.fields[formulaFieldId] ?? null);
        const expected = visibleRows.map((row) => row.scope);
        if (JSON.stringify(seen) !== JSON.stringify(expected)) {
          throw new Error(
            `the restricted person's rows read ${JSON.stringify(seen)} in the worked-out column, expected ` +
              `${JSON.stringify(expected)} - the column they may read has stopped carrying its value`,
          );
        }
        return { routing, seen, computedActivityRead: false };
      },
    );

    return {
      details: {
        tableId,
        formulaFieldId,
        restrictedJoin: person.join,
        visibleRows: visibleRows.length,
        hiddenRows: hiddenRows.length,
        valuesTheRestrictedPersonSees: probe.seen,
        routing: probe.routing,
      },
    };
  } finally {
    if (person) {
      try {
        await person.cleanUp();
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
