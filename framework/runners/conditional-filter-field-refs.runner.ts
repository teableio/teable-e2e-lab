import { FieldKeyType, FieldType } from "@teable/core";
import {
  getRecords as apiGetRecords,
  updateRecords as apiUpdateRecords,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ConditionalFilterFieldRefsCaseConfig } from "../types";

// A conditional lookup whose condition compares two columns of the table it
// lives on -> edit a row -> checkpoint: the column fills in and keeps up.
//
// A conditional lookup matches rows by a condition instead of following a
// link, and the condition can name a field rather than a constant: "where the
// other table's reference equals this row's reference". Naming a field on the
// host table on BOTH sides of that comparison is a shape people build - "where
// these two columns of mine agree" - and the set-based query paths could not
// generate SQL for it. They resolved the field against the wrong table and
// answered "Field not found", or probed a column on the wrong alias and
// answered "column s.<name> does not exist".
//
// Either way the whole computed run for that table dead-lettered as a code
// bug, not retried, on every recompute. The column never fills in and the
// table stops keeping up - the same outcome the rest of this repository's
// computed cases describe, reached from the filter side.
//
// Nothing here is written with SQL: this shape is built entirely through the
// field editor, which is what makes it worth guarding.

const NAME_FIELD = "Name";
const LEFT_FIELD = "Left Key";
const RIGHT_FIELD = "Right Key";
const VALUE_FIELD = "Value";
const LOOKUP_FIELD = "Matched Value";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runConditionalFilterFieldRefsCase = async (
  bugCase: BugCaseFor<"conditional-filter-field-refs">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalFilterFieldRefsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let hostTableId = "";
  let foreignTableId = "";

  const matching = config.rows.filter((row) => row.left === row.right);
  if (matching.length < 1 || matching.length === config.rows.length) {
    throw new Error(
      "the fixture needs at least one row whose two keys agree and at least one where they do not - " +
        "otherwise the condition's answer is the same for every row and matching nothing looks like matching",
    );
  }

  try {
    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: LEFT_FIELD, type: FieldType.SingleLineText },
        { name: RIGHT_FIELD, type: FieldType.SingleLineText },
        { name: VALUE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [LEFT_FIELD]: row.left,
          [RIGHT_FIELD]: row.right,
          [VALUE_FIELD]: row.value,
        },
      })),
    });
    hostTableId = hostTable.id;
    const hostFieldId = (name: string) =>
      hostTable.fields.find((field: { name: string }) => field.name === name)
        ?.id;
    const leftFieldId = hostFieldId(LEFT_FIELD);
    const rightFieldId = hostFieldId(RIGHT_FIELD);
    const hostValueFieldId = hostFieldId(VALUE_FIELD);
    if (!leftFieldId || !rightFieldId || !hostValueFieldId) {
      throw new Error(`Host table ${hostTableId} is not in place`);
    }

    // Where the values are read from. "selfTable" reads the host's own value
    // column - the field-reference sides and the lookup source are all one
    // table, which is the shape that probed a column on the wrong alias.
    // "foreignTable" reads another table while the condition still compares
    // two host columns, which is the shape that resolved the filter field
    // against the wrong table.
    let lookupTableId = hostTableId;
    let lookupValueFieldId = hostValueFieldId;
    if (config.source === "foreignTable") {
      const foreignTable = await createTable(baseId, {
        name: `${suffix}-foreign`,
        fields: [
          { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
          { name: VALUE_FIELD, type: FieldType.SingleLineText },
        ],
        records: [
          {
            fields: {
              [NAME_FIELD]: "foreign-row",
              [VALUE_FIELD]: config.foreignValue,
            },
          },
        ],
      });
      foreignTableId = foreignTable.id;
      lookupTableId = foreignTable.id;
      lookupValueFieldId = foreignTable.fields.find(
        (field: { name: string }) => field.name === VALUE_FIELD,
      )?.id;
      if (!lookupValueFieldId) {
        throw new Error(`Foreign table ${foreignTableId} is not in place`);
      }
    }

    // Both sides of the comparison name a column of the host table. That is
    // the whole fixture.
    const lookupField = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      isConditionalLookup: true,
      lookupOptions: {
        foreignTableId: lookupTableId,
        lookupFieldId: lookupValueFieldId,
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: leftFieldId,
              operator: "is",
              value: { type: "field", fieldId: rightFieldId },
            },
          ],
        },
      },
    });

    const readRows = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.rows.length,
      });
      return {
        headers: response.headers,
        rows: response.data.records.map(
          (record: { id: string; fields: Record<string, unknown> }) => {
            const cell = record.fields[LOOKUP_FIELD];
            return {
              id: record.id,
              name: String(record.fields[NAME_FIELD] ?? ""),
              matched: Array.isArray(cell)
                ? cell.map((entry) => String(entry)).join(",")
                : String(cell ?? ""),
            };
          },
        ),
      };
    };

    const expectedFor = (row: (typeof config.rows)[number]) => {
      if (row.left !== row.right) {
        return "";
      }
      return config.source === "foreignTable" ? config.foreignValue : row.value;
    };

    const waitForMatched = async (
      expected: Map<string, string>,
      what: string,
    ) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let seen: { name: string; matched: string }[] = [];
      for (;;) {
        const current = await readRows();
        seen = current.rows.map((row) => ({
          name: row.name,
          matched: row.matched,
        }));
        const wrong = seen.filter(
          (row) => row.matched !== (expected.get(row.name) ?? ""),
        );
        if (wrong.length === 0) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `after ${config.settleTimeoutMs}ms ${what} reads ${JSON.stringify(seen)}, expected ` +
              `${JSON.stringify([...expected].map(([name, matched]) => ({ name, matched })))} - ` +
              "the condition compares two columns of this table, and generating SQL for it is what failed",
          );
        }
        await sleep(config.pollIntervalMs);
      }
    };

    const initialExpected = new Map(
      config.rows.map((row) => [row.name, expectedFor(row)] as const),
    );
    const editedExpected = new Map(
      config.rows.map(
        (row) =>
          [row.name, row.left === row.right ? config.editedValue : ""] as const,
      ),
    );

    const probe = await bugCheckpoint(
      "conditional-filter-over-two-own-columns-computes",
      async () => {
        // Creating the field started the first pass; this is it landing.
        const settled = await waitForMatched(
          initialExpected,
          "the conditional lookup",
        );

        // Then one edit, so the case covers a recompute as well as the
        // backfill - the report is about every recompute dead-lettering, not
        // only the first.
        if (config.source === "foreignTable") {
          const foreignRows = await apiGetRecords(foreignTableId, {
            fieldKeyType: FieldKeyType.Name,
            take: 1,
          });
          await apiUpdateRecords(foreignTableId, {
            fieldKeyType: FieldKeyType.Name,
            typecast: false,
            records: [
              {
                id: foreignRows.data.records[0].id,
                fields: { [VALUE_FIELD]: config.editedValue },
              },
            ],
          });
        } else {
          await apiUpdateRecords(hostTableId, {
            fieldKeyType: FieldKeyType.Name,
            typecast: false,
            records: settled.rows
              .filter((row) => initialExpected.get(row.name))
              .map((row) => ({
                id: row.id,
                fields: { [VALUE_FIELD]: config.editedValue },
              })),
          });
        }

        const after = await waitForMatched(
          editedExpected,
          "the conditional lookup after an edit",
        );
        return {
          rows: after.rows.map((row) => ({
            name: row.name,
            matched: row.matched,
          })),
        };
      },
    );

    const after = await readRows();
    const routing = assertServedByV2(after.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    return {
      details: {
        hostTableId,
        foreignTableId: foreignTableId || null,
        source: config.source,
        lookupFieldId: lookupField.id,
        routing,
        rows: probe.rows,
      },
    };
  } finally {
    for (const tableId of [hostTableId, foreignTableId]) {
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
