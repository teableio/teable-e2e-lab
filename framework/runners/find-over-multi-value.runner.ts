import { Colors, FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { FindOverMultiValueCaseConfig } from "../types";

// A formula searching a multi-select cell for a word -> checkpoint: it answers
// for every row.
//
// FIND is how a formula asks "does this text contain that". Pointed at a
// multi-select - or a link cell, which is the same shape - the column holds
// several values rather than one string, and the query built for it asked
// Postgres to search inside a jsonb value with a text operator. That fails,
// and it fails the whole computed task, so the formula column never fills in.
//
// The user's version of this is short: a formula that works on a text column
// produces nothing at all when pointed at a multi-select, with no error to
// read.
//
// Two rows: one whose selection contains the word and one whose does not. The
// second is what makes a zero meaningful - a column of zeroes and a column
// that never computed look identical if nothing is supposed to match.

const NAME_FIELD = "Name";
const TAGS_FIELD = "Tags";
const FOUND_FIELD = "Found";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runFindOverMultiValueCase = async (
  bugCase: BugCaseFor<"find-over-multi-value">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: FindOverMultiValueCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const matching = config.rows.filter((row) =>
    row.tags.some((tag) => tag.includes(config.needle)),
  );
  const missing = config.rows.filter(
    (row) => !row.tags.some((tag) => tag.includes(config.needle)),
  );
  if (matching.length < 1 || missing.length < 1) {
    throw new Error(
      `the fixture needs a row whose tags contain ${JSON.stringify(config.needle)} and one that does not - ` +
        "a column of zeroes and a column that never computed look identical otherwise",
    );
  }

  const palette = [Colors.BlueBright, Colors.GreenBright, Colors.OrangeBright];
  const allTags = [...new Set(config.rows.flatMap((row) => row.tags))];

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: TAGS_FIELD,
          type: FieldType.MultipleSelect,
          options: {
            choices: allTags.map((name, index) => ({
              name,
              color: palette[index % palette.length],
            })),
          },
        },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [TAGS_FIELD]: row.tags },
      })),
    });
    tableId = table.id;
    const tagsFieldId = table.fields.find(
      (field: { name: string }) => field.name === TAGS_FIELD,
    )?.id;
    if (!tagsFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readRows = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.rows.length,
      });
      return {
        headers: response.headers,
        byName: new Map(
          response.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              record.fields[FOUND_FIELD],
            ],
          ),
        ),
      };
    };

    // Fixture verification, outside the checkpoint: the selections landed. A
    // multi-select that stored nothing would make every row's answer zero for
    // a reason that is not the formula.
    const seeded = await apiGetRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      take: config.rows.length,
    });
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    for (const row of config.rows) {
      const stored = seeded.data.records.find(
        (record: { fields: Record<string, unknown> }) =>
          String(record.fields[NAME_FIELD] ?? "") === row.name,
      )?.fields[TAGS_FIELD];
      const storedTags = Array.isArray(stored) ? stored.map(String) : [];
      if (storedTags.join("|") !== row.tags.join("|")) {
        throw new Error(
          `"${row.name}" holds ${JSON.stringify(storedTags)}, expected ${JSON.stringify(row.tags)} - ` +
            "the fixture is not in place",
        );
      }
    }

    const expected = new Map(
      config.rows.map(
        (row) =>
          [
            row.name,
            row.tags.some((tag) => tag.includes(config.needle)) ? "yes" : "no",
          ] as const,
      ),
    );

    const probe = await bugCheckpoint(
      "find-over-a-multi-select-answers",
      async () => {
        // Wrapped in IF so every row has a word to read. FIND's answer for a
        // row that does not match is a zero or a blank depending on the build,
        // and a blank cannot be told from a column that never computed - which
        // is exactly the failure here.
        await createField(tableId, {
          name: FOUND_FIELD,
          type: FieldType.Formula,
          options: {
            expression: `IF(FIND("${config.needle}", {${tagsFieldId}}) > 0, "yes", "no")`,
          },
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        let seen: { name: string; value: unknown }[] = [];
        for (;;) {
          const current = await readRows();
          seen = [...current.byName.entries()].map(([name, value]) => ({
            name: String(name),
            value,
          }));
          const wrong = [...expected.entries()].filter(
            ([name, want]) => String(current.byName.get(name) ?? "") !== want,
          );
          if (wrong.length === 0) {
            return { rows: seen };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.pollIntervalMs);
        }

        throw new Error(
          `after ${config.settleTimeoutMs}ms the formula reads ${JSON.stringify(seen)}, expected ` +
            `${JSON.stringify([...expected.entries()])} - searching a multi-select is what it could not do`,
        );
      },
    );

    return {
      details: {
        tableId,
        routing,
        needle: config.needle,
        rows: probe.rows,
      },
    };
  } finally {
    if (tableId) {
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
