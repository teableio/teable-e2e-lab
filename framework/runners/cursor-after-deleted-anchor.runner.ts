import { FieldKeyType, FieldType } from "@teable/core";
import {
  GET_RECORDS_URL,
  axios,
  deleteRecord as apiDeleteRecord,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CursorAfterDeletedAnchorCaseConfig } from "../types";

// Page through a view with a cursor -> delete the last row of the page just
// read -> ask for the next page with the cursor that page handed out ->
// checkpoint: the next page holds the rows that come after it.
//
// A cursor says "continue after this row". It found its place by looking that
// row up again - so once the row was gone, the next page came back empty, and
// a client paging through a table stopped early, as if it had reached the end.
// Everything after that point was silently missed. Deleting rows while someone
// else pages through a table is ordinary collaboration, not an edge case.

const NAME_FIELD = "Name";

type Page = { names: string[]; nextCursor?: string };

export const runCursorAfterDeletedAnchorCase = async (
  bugCase: BugCaseFor<"cursor-after-deleted-anchor">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CursorAfterDeletedAnchorCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.rowCount < config.pageSize * 2 + 1) {
    throw new Error(
      "the table needs more than two pages, so the page after the deleted row is a full one",
    );
  }
  const names = Array.from(
    { length: config.rowCount },
    (_, index) => `row-${String(index + 1).padStart(3, "0")}`,
  );

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: names.map((name) => ({ fields: { [NAME_FIELD]: name } })),
    });
    tableId = table.id;
    const viewId = table.views?.[0]?.id as string;
    const nameFieldId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id as string;
    const idByName = new Map<string, string>(
      (table.records ?? []).map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD]),
          record.id,
        ],
      ),
    );

    const readPage = async (cursor?: string) => {
      const response = await axios.get(
        urlBuilder(GET_RECORDS_URL, { tableId }),
        {
          params: {
            viewId,
            take: config.pageSize,
            fieldKeyType: FieldKeyType.Id,
            ...(cursor ? { cursor } : {}),
          },
          validateStatus: () => true,
        },
      );
      const page: Page = {
        names: (
          (response.data?.records ?? []) as {
            fields: Record<string, unknown>;
          }[]
        ).map((record) => String(record.fields[nameFieldId])),
        nextCursor: response.data?.extra?.nextCursor,
      };
      return { response, page };
    };

    // Fixture verification, outside the checkpoint: the first page is the
    // first rows in view order, and it hands out a cursor. Without a cursor
    // there is nothing to continue from.
    const first = await readPage();
    const routing = assertServedByV2(first.response.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const expectedFirst = names.slice(0, config.pageSize);
    if (
      first.response.status !== 200 ||
      JSON.stringify(first.page.names) !== JSON.stringify(expectedFirst) ||
      !first.page.nextCursor
    ) {
      throw new Error(
        `the first page answered ${first.response.status} with ${JSON.stringify(first.page)}, expected ` +
          `${JSON.stringify(expectedFirst)} and a cursor to continue from`,
      );
    }

    // The row the cursor points at: the last one on the page just read.
    const anchor = expectedFirst[expectedFirst.length - 1] as string;
    await apiDeleteRecord(tableId, idByName.get(anchor) as string);

    const probe = await bugCheckpoint(
      "a-cursor-continues-after-its-row-is-deleted",
      async () => {
        const next = await readPage(first.page.nextCursor);
        if (next.response.status !== 200) {
          throw new Error(
            `the next page answered ${next.response.status}: ${JSON.stringify(next.response.data)}`,
          );
        }
        const expectedNext = names.slice(config.pageSize, config.pageSize * 2);
        if (JSON.stringify(next.page.names) !== JSON.stringify(expectedNext)) {
          throw new Error(
            `after deleting ${anchor}, the row the cursor pointed at, the next page held ` +
              `${JSON.stringify(next.page.names)}, expected ${JSON.stringify(expectedNext)}` +
              (next.page.names.length === 0
                ? ` - the list ends here, with ${config.rowCount - config.pageSize} rows still after it`
                : ""),
          );
        }
        return { next: next.page.names };
      },
    );

    return {
      details: { tableId, routing, anchor, nextPage: probe.next },
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
