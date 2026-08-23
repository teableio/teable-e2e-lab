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

// A conditional lookup whose condition compares two columns of one table
// against each other -> let it compute, then edit -> checkpoint: the column
// fills in and keeps up.
//
// A conditional lookup matches rows by a condition instead of following a
// link, and the condition can name a field rather than a constant. Naming a
// column on BOTH sides of that comparison - "where these two columns agree" -
// is a shape people build, and the set-based query paths could not generate
// SQL for it. Which table those columns belong to picks the failure:
//
//   sourceBothSides (T6615): both sides name the table being read from. The
//     builder swaps the two sides of a same-table reference and probed the
//     referenced column on the source alias, answering
//     "column s.<name> does not exist".
//   hostBothSides (T6599): both sides name the table the lookup lives on. The
//     field-reference fast paths resolved the filter's field against the table
//     being read from, did not find it, and failed with a bare
//     "Field not found".
//
// Either way the whole computed run for that table dead-lettered as a code
// bug, not retried, on every recompute: the column never fills in and the
// table stops keeping up.
//
// Nothing here is written with SQL - the shape is built through the field
// editor - which is what makes it worth guarding.
//
// One measured surprise, recorded because a reader would assume otherwise: a
// host-both-sides condition does not compare each row's own two columns. It
// matches every row. See the case doc.

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

  const agreeing = config.foreignRows.filter((row) => row.left === row.right);
  if (config.source === "sourceBothSides") {
    if (
      agreeing.length !== 1 ||
      agreeing.length === config.foreignRows.length
    ) {
      throw new Error(
        "exactly one source row may have agreeing keys, and at least one must not - otherwise the " +
          "condition's answer cannot be told from matching everything or nothing",
      );
    }
  } else if (config.foreignRows.length !== 1) {
    throw new Error(
      "the host-both-sides shape reads every source row, so the fixture uses exactly one - with more, " +
        "the expected value would depend on how several matches are joined, which is a different question",
    );
  }

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: LEFT_FIELD, type: FieldType.SingleLineText },
        { name: RIGHT_FIELD, type: FieldType.SingleLineText },
        { name: VALUE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.foreignRows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [LEFT_FIELD]: row.left,
          [RIGHT_FIELD]: row.right,
          [VALUE_FIELD]: row.value,
        },
      })),
    });
    foreignTableId = foreignTable.id;
    const foreignFieldId = (name: string) =>
      foreignTable.fields.find((field: { name: string }) => field.name === name)
        ?.id;
    const foreignValueFieldId = foreignFieldId(VALUE_FIELD);
    if (!foreignValueFieldId) {
      throw new Error(`Source table ${foreignTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: LEFT_FIELD, type: FieldType.SingleLineText },
        { name: RIGHT_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.hostRows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [LEFT_FIELD]: row.left,
          [RIGHT_FIELD]: row.right,
        },
      })),
    });
    hostTableId = hostTable.id;
    const hostFieldId = (name: string) =>
      hostTable.fields.find((field: { name: string }) => field.name === name)
        ?.id;

    const filterLeftId =
      config.source === "sourceBothSides"
        ? foreignFieldId(LEFT_FIELD)
        : hostFieldId(LEFT_FIELD);
    const filterRightId =
      config.source === "sourceBothSides"
        ? foreignFieldId(RIGHT_FIELD)
        : hostFieldId(RIGHT_FIELD);
    if (!filterLeftId || !filterRightId) {
      throw new Error("the fields the condition compares are not in place");
    }

    const lookupField = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      isConditionalLookup: true,
      lookupOptions: {
        foreignTableId,
        lookupFieldId: foreignValueFieldId,
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: filterLeftId,
              operator: "is",
              value: { type: "field", fieldId: filterRightId },
            },
          ],
        },
      },
    });

    const readRows = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.hostRows.length,
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

    // What every host row should read. Both shapes end up showing the value of
    // the source rows the condition selected, and both select the same rows for
    // every host row - measured, and stated in the case doc because a reader
    // would expect a row-local comparison instead.
    const matchedValue =
      config.source === "sourceBothSides"
        ? agreeing[0].value
        : config.foreignRows[0].value;

    const waitForMatched = async (expected: string, what: string) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let seen: { name: string; matched: string }[] = [];
      for (;;) {
        const current = await readRows();
        seen = current.rows.map((row) => ({
          name: row.name,
          matched: row.matched,
        }));
        if (
          seen.length === config.hostRows.length &&
          seen.every((row) => row.matched === expected)
        ) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `after ${config.settleTimeoutMs}ms ${what} reads ${JSON.stringify(seen)}, expected every row to ` +
              `read ${JSON.stringify(expected)} - generating SQL for a condition that compares two columns ` +
              "of one table is what failed",
          );
        }
        await sleep(config.pollIntervalMs);
      }
    };

    const probe = await bugCheckpoint(
      "conditional-filter-over-two-own-columns-computes",
      async () => {
        // Creating the field started the first pass; this is it landing.
        await waitForMatched(matchedValue, "the conditional lookup");

        // Then one edit on the source row the condition selected, so the case
        // covers a recompute as well as the backfill - the report is about
        // every recompute dead-lettering, not only the first.
        const selected =
          config.source === "sourceBothSides"
            ? agreeing[0].name
            : config.foreignRows[0].name;
        const sourceRows = await apiGetRecords(foreignTableId, {
          fieldKeyType: FieldKeyType.Name,
          take: config.foreignRows.length,
        });
        const target = sourceRows.data.records.find(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD] ?? "") === selected,
        );
        if (!target) {
          throw new Error(`the source row "${selected}" is not there`);
        }
        await apiUpdateRecords(foreignTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: false,
          records: [
            { id: target.id, fields: { [VALUE_FIELD]: config.editedValue } },
          ],
        });

        const after = await waitForMatched(
          config.editedValue,
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
        foreignTableId,
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
