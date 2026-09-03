import { Colors, FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { OrFilteredRollupScopeCaseConfig } from "../types";

// A total over linked rows, narrowed to "status is todo OR status is doing" ->
// checkpoint: each row totals only the rows it is actually linked to.
//
// "Open work on this project", "unpaid invoices for this customer" - the two-
// or-more-values condition is how a summary says "any of these". Written with
// OR, the condition escaped the link: the query stopped asking "and linked to
// this row" and totalled every matching row in the other table.
//
// The number that comes out is plausible - it is a real sum of real rows - so
// nothing looks broken. The tell is the row that is linked to nothing at all
// and still shows a figure, which is what the report leads with: a project
// created a minute ago, joined to nothing, already showing other people's
// numbers.
//
// The fixture therefore carries three kinds of foreign row, and the case is
// worthless without all three: rows this host is linked to that the condition
// selects, rows it is linked to that the condition excludes, and rows the
// condition selects that belong to somebody else. Drop the third and a total
// that ignored the link would give the right answer anyway.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";
const AMOUNT_FIELD = "Amount";
const LINK_FIELD = "Work";
const ROLLUP_FIELD = "Open work";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runOrFilteredRollupScopeCase = async (
  bugCase: BugCaseFor<"or-filtered-rollup-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: OrFilteredRollupScopeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let workTableId = "";
  let hostTableId = "";

  const selected = new Set(config.selectedStatuses);
  const mine = config.work.filter((row) => row.owner === config.linkedHost);
  const minesSelected = mine.filter((row) => selected.has(row.status));
  const mineExcluded = mine.filter((row) => !selected.has(row.status));
  const othersSelected = config.work.filter(
    (row) => row.owner !== config.linkedHost && selected.has(row.status),
  );
  if (
    minesSelected.length === 0 ||
    mineExcluded.length === 0 ||
    othersSelected.length === 0
  ) {
    throw new Error(
      "the fixture needs all three kinds of row - linked and selected, linked and excluded, " +
        "and selected but belonging to another host. Without the third, a total that ignored " +
        "the link would still read correctly",
    );
  }
  if (config.selectedStatuses.length < 2) {
    throw new Error(
      "at least two statuses, or the condition has nothing to OR together and this is a different bug",
    );
  }
  const expectedLinkedTotal = minesSelected.reduce(
    (sum, row) => sum + row.amount,
    0,
  );
  const statuses = [...new Set(config.work.map((row) => row.status))];

  try {
    const workTable = await createTable(baseId, {
      name: `${suffix}-work`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: statuses.map((name) => ({ name, color: Colors.Blue })),
          },
        },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.work.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [STATUS_FIELD]: row.status,
          [AMOUNT_FIELD]: row.amount,
        },
      })),
    });
    workTableId = workTable.id;
    const statusFieldId = workTable.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    )?.id;
    const amountFieldId = workTable.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    if (!statusFieldId || !amountFieldId) {
      throw new Error(`the work table ${workTableId} is not in place`);
    }
    const workIdByName = new Map<string, string>(
      workTable.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD]),
          record.id,
        ],
      ),
    );

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    hostTableId = hostTable.id;
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: workTableId,
        relationship: Relationship.OneMany,
      },
    });

    // One host joined to its own rows, and one joined to nothing - the row the
    // report is about, created and never linked.
    await apiCreateRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: config.linkedHost,
            [LINK_FIELD]: mine.map((row) => ({
              id: workIdByName.get(row.name) as string,
            })),
          },
        },
        { fields: { [NAME_FIELD]: config.unlinkedHost } },
      ],
    });

    const rollupField = await createField(hostTableId, {
      name: ROLLUP_FIELD,
      type: FieldType.Rollup,
      options: { expression: "sum({values})" },
      lookupOptions: {
        foreignTableId: workTableId,
        linkFieldId: linkField.id,
        lookupFieldId: amountFieldId,
        filter: {
          conjunction: "or",
          filterSet: config.selectedStatuses.map((status) => ({
            fieldId: statusFieldId,
            operator: "is",
            value: status,
          })),
        },
      },
    });

    const readHosts = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 10,
      });
      const byName = new Map(
        response.data.records.map((record) => [
          String(record.fields[NAME_FIELD]),
          record.fields[ROLLUP_FIELD] ?? null,
        ]),
      );
      return { headers: response.headers, byName };
    };

    // Settling before the checkpoint, on the LINKED host only. Its total is the
    // one a working build has to reach, so waiting for it is waiting for the
    // computation to finish rather than for the bug to appear - the unlinked
    // host is then read from that same settled state.
    const deadline = Date.now() + config.settleTimeoutMs;
    let settled = await readHosts();
    for (;;) {
      if (
        Number(settled.byName.get(config.linkedHost)) === expectedLinkedTotal
      ) {
        break;
      }
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(config.pollIntervalMs);
      settled = await readHosts();
    }

    const routing = assertServedByV2(settled.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "an-any-of-these-total-counts-only-what-this-row-is-linked-to",
      async () => {
        const linkedTotal = settled.byName.get(config.linkedHost) ?? null;
        const unlinkedTotal = settled.byName.get(config.unlinkedHost) ?? null;

        // The row linked to nothing. Any figure here came from somebody else's
        // rows, which is the symptom the report opens with.
        if (unlinkedTotal !== null && Number(unlinkedTotal) !== 0) {
          throw new Error(
            `"${config.unlinkedHost}" is linked to nothing and totals ${JSON.stringify(unlinkedTotal)}. ` +
              `The other table holds ${JSON.stringify(
                config.work.map(
                  (row) => `${row.name}/${row.status}/${row.amount}`,
                ),
              )}`,
          );
        }

        if (Number(linkedTotal) !== expectedLinkedTotal) {
          throw new Error(
            `"${config.linkedHost}" totals ${JSON.stringify(linkedTotal)}, expected ${expectedLinkedTotal} ` +
              `from its own ${JSON.stringify(minesSelected.map((row) => row.name))}. ` +
              `Linked but excluded: ${JSON.stringify(mineExcluded.map((row) => row.name))}; ` +
              `selected but somebody else's: ${JSON.stringify(othersSelected.map((row) => row.name))}`,
          );
        }
        return { linkedTotal, unlinkedTotal };
      },
    );

    return {
      details: {
        workTableId,
        hostTableId,
        rollupFieldId: rollupField.id,
        expectedLinkedTotal,
        routing,
        ...probe,
      },
    };
  } finally {
    for (const tableId of [hostTableId, workTableId]) {
      if (!tableId) {
        continue;
      }
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
