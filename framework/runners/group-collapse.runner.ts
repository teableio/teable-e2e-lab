import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  SortFunc,
  TimeFormatting,
} from "@teable/core";
import { GroupPointType, axios } from "@teable/openapi";
import {
  createRecords,
  createTable,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { GroupCollapseCaseConfig } from "../types";
import { bucketProblems, bucketRows, bucketTitles } from "./group-buckets";

// Create a table with one date field -> seed consecutive local-day buckets ->
// prove the product groups them into exactly those buckets -> checkpoint:
// collapse each group in turn and prove the grid receives exactly the rows
// outside it.
//
// The phase boundary carries the verdict: grouping itself landing wrong means
// the fixture never stood up (error), because every conclusion below reads
// "the rows under the collapsed group" off group headers that must be correct
// first. Only the collapse observation counts as the bug.
//
// Rows are identified by title rather than by position: the order inside a
// group is not part of what this case asserts, while WHICH rows come back is
// the entire question. Comparing sorted title lists answers both halves of the
// failure at once - a title from the collapsed bucket showing up is a leak, a
// title from another bucket going missing is a row wrongly hidden.

const TITLE_FIELD = "Title";
const DATE_FIELD = "Day";

type CollapseProbe = {
  collapsed: string;
  expected: string[];
  received: string[];
  leaked: string[];
  hidden: string[];
};

const seedBuckets = async (
  tableId: string,
  config: GroupCollapseCaseConfig,
): Promise<void> => {
  const records = config.buckets.flatMap((bucket) =>
    bucketRows(bucket).map((row) => ({
      // Each row sits at its own hour of the local day, not at the bucket key.
      // A row at exactly local midnight is excluded correctly even by the
      // broken filter, so a midnight-only fixture is green on both sides.
      fields: { [TITLE_FIELD]: row.title, [DATE_FIELD]: row.instant },
    })),
  );
  await createRecords(tableId, {
    fieldKeyType: FieldKeyType.Name,
    typecast: false,
    records,
  });
};

export const runGroupCollapseCase = async (
  bugCase: BugCaseFor<"group-collapse">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const fixtureProblems = bucketProblems(config.buckets, config.timeZone);
  if (fixtureProblems.length > 0) {
    throw new Error(
      `Bucket fixture is not usable - the case cannot run: ${fixtureProblems.join("; ")}`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: [],
    });
    tableId = table.id;

    const dateField = table.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    );
    if (!dateField) {
      throw new Error(`Table ${tableId} has no "${DATE_FIELD}" field`);
    }
    const groupBy = [{ fieldId: dateField.id, order: SortFunc.Asc }];
    // The grid always loads through a view; asking without one takes a
    // different query path than the one the user is on.
    const viewId = table.views?.[0]?.id;
    if (!viewId) {
      throw new Error(`Table ${tableId} has no default view`);
    }

    await seedBuckets(tableId, config);
    const expectedTitles = config.buckets.flatMap(bucketTitles);

    // Fixture verification, deliberately outside the checkpoint: if the
    // product bucketed these rows differently, the collapse question below is
    // not even askable. `take` is the exact seeded row count - this endpoint
    // rejects "take everything", and a page smaller than the fixture would
    // make the header check read a partial grouping.
    const seeded = await getRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      viewId,
      groupBy,
      take: expectedTitles.length,
    });
    const titleById = new Map<string, string>(
      seeded.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          record.id,
          String(record.fields[TITLE_FIELD]),
        ],
      ),
    );
    if (titleById.size !== expectedTitles.length) {
      throw new Error(
        `Seed did not land: expected ${expectedTitles.length} rows, read back ${titleById.size}`,
      );
    }

    const headers = (seeded.extra?.groupPoints ?? []).filter(
      (point: { type: number }) => point.type === GroupPointType.Header,
    ) as { id: string; value: unknown }[];
    if (headers.length !== config.buckets.length) {
      throw new Error(
        `Expected ${config.buckets.length} group headers, got ${headers.length} - the fixture is not grouped as declared`,
      );
    }
    const misgrouped = config.buckets
      .map((bucket, index) => ({ bucket, header: headers[index] }))
      .filter(
        ({ bucket, header }) =>
          new Date(String(header.value)).getTime() !==
          new Date(bucket.instant).getTime(),
      )
      .map(
        ({ bucket, header }) =>
          `${bucket.localDay}: header is ${String(header.value)}, expected ${bucket.instant}`,
      );
    if (misgrouped.length > 0) {
      throw new Error(
        `Group headers do not match the declared buckets: ${misgrouped.join("; ")}`,
      );
    }

    const probes = await bugCheckpoint("collapsed-group-excluded", async () => {
      const collected: CollapseProbe[] = [];
      // Newest bucket first, on purpose: the mis-aimed exclusion lands on the
      // day BEFORE the collapsed one, so collapsing the newest bucket is the
      // probe where both directions show up together - its own rows leak and
      // the previous day's rows go missing. Starting with the oldest bucket
      // would fail on a leak alone and never print the missing half.
      for (let index = config.buckets.length - 1; index >= 0; index -= 1) {
        const bucket = config.buckets[index];
        const collapsedTitles = new Set(bucketTitles(bucket));
        const expected = expectedTitles
          .filter((title) => !collapsedTitles.has(title))
          .sort();
        // The grid loads its rows through this endpoint; the REST record list
        // does not carry collapsedGroupIds at all, so asking it would answer a
        // different question.
        const response = await axios.post<{ ids: string[] }>(
          `/table/${tableId}/record/socket/doc-ids`,
          {
            fieldKeyType: FieldKeyType.Id,
            viewId,
            groupBy,
            collapsedGroupIds: [headers[index].id],
          },
        );
        const received = response.data.ids
          .map((id) => titleById.get(id) ?? `<unknown:${id}>`)
          .sort();
        const probe: CollapseProbe = {
          collapsed: bucket.localDay,
          expected,
          received,
          leaked: received.filter((title) => collapsedTitles.has(title)),
          hidden: expected.filter((title) => !received.includes(title)),
        };
        collected.push(probe);
        if (probe.leaked.length > 0 || probe.hidden.length > 0) {
          throw new Error(
            `collapsing ${bucket.localDay} returned the wrong rows - leaked from the collapsed group: [${probe.leaked.join(", ")}]; wrongly hidden: [${probe.hidden.join(", ")}]; received [${received.join(", ")}], expected [${expected.join(", ")}]`,
          );
        }
        if (received.join(" ") !== expected.join(" ")) {
          throw new Error(
            `collapsing ${bucket.localDay} returned unexpected rows: received [${received.join(", ")}], expected [${expected.join(", ")}]`,
          );
        }
      }
      return collected;
    });

    return {
      details: {
        tableId,
        tableName,
        timeZone: config.timeZone,
        buckets: config.buckets,
        probes,
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
