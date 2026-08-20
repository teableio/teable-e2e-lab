import { FieldKeyType, FieldType, stringifyClipboardText } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  PASTE_BY_ID_URL,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { PasteByIdAlignmentCaseConfig } from "../types";

// Paste a column of distinct values into a list of records by id ->
// checkpoint: every value landed on its own record, and a paste naming a
// record that does not exist is refused rather than shifted.
//
// Selection paste used to load one record per row - a table load each, which
// is what made it slow. Batching those into one query is the right fix and it
// moves the ordering guarantee from the language into the code: the batched
// loader returns a map, and the payload is positional, so a row the loader
// drops silently pulls every later value one target up.
//
// That failure is quiet. The paste answers 200, the right number of cells
// change, and the values sit on the wrong rows - which is only visible if
// every row carries a value that could not belong to any other.
//
// Two things are asserted for that reason: each record holds its own value,
// and a paste that names a missing record is refused. The second is the
// mechanism behind the first - dropping the unknown row instead of refusing is
// exactly how the later values would slide.

const LABEL_FIELD = "Label";
const CELL_FIELD = "Cell";

export const runPasteByIdAlignmentCase = async (
  bugCase: BugCaseFor<"paste-by-id-alignment">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PasteByIdAlignmentCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  let tableId = "";

  if (config.rowCount < 3) {
    throw new Error(
      `rowCount ${config.rowCount} is too small - a shift by one is indistinguishable from a single wrong cell below three rows`,
    );
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: LABEL_FIELD, type: FieldType.SingleLineText },
        { name: CELL_FIELD, type: FieldType.SingleLineText },
      ],
      // Every row is distinguishable from every other in both fields, so a
      // value that lands one row off cannot look like a value that landed
      // correctly.
      records: Array.from({ length: config.rowCount }, (_, index) => ({
        fields: {
          [LABEL_FIELD]: `row-${index}`,
          [CELL_FIELD]: `before-${index}`,
        },
      })),
    });
    tableId = table.id;
    const cellField = table.fields.find(
      (field: { name: string }) => field.name === CELL_FIELD,
    );
    const viewId = table.views?.[0]?.id;
    if (!cellField || !viewId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readRows = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.rowCount + 10,
      });
      return {
        headers: response.headers,
        rows: response.data.records.map((record) => ({
          id: record.id,
          label: String(record.fields[LABEL_FIELD] ?? ""),
          cell: String(record.fields[CELL_FIELD] ?? ""),
        })),
      };
    };

    // Fixture verification, outside the checkpoint: the rows are all there and
    // still carry their seeded values, so "this cell changed" below means the
    // paste changed it.
    const before = await readRows();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (before.rows.length !== config.rowCount) {
      throw new Error(
        `seeded ${before.rows.length} rows, expected ${config.rowCount} - the fixture is not in place`,
      );
    }
    const misSeeded = before.rows.filter(
      (row, index) =>
        row.label !== `row-${index}` || row.cell !== `before-${index}`,
    );
    if (misSeeded.length > 0) {
      throw new Error(
        `the seeded rows do not read back in order: ${JSON.stringify(misSeeded.slice(0, 3))}`,
      );
    }

    const recordIds = before.rows.map((row) => row.id);
    const paste = async (ids: string[], values: string[]) => {
      // Raw axios with the status open: one of these pastes is supposed to be
      // refused, and the generated client would drop the response - routing
      // headers and all - the moment it was.
      const response = await axios.patch(
        urlBuilder(PASTE_BY_ID_URL, { tableId }),
        {
          viewId,
          selection: { recordIds: ids, fieldIds: [cellField.id] },
          projection: [cellField.id],
          content: stringifyClipboardText(values.map((value) => [value])),
          header: [],
        },
        { validateStatus: () => true },
      );
      return {
        status: response.status,
        body:
          response.data === undefined
            ? undefined
            : typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data),
        headers: response.headers,
      };
    };

    const probe = await bugCheckpoint(
      "pasted-values-land-on-their-own-rows",
      async () => {
        const expected = recordIds.map((_, index) => `after-${index}`);
        const pasted = await paste(recordIds, expected);
        const pasteRouting = assertServedByV2(pasted.headers, {
          operation: "PATCH /table/{tableId}/selection/paste-by-id",
          feature: "paste",
        });
        if (pasted.status < 200 || pasted.status >= 300) {
          throw new Error(
            `pasting ${expected.length} values by id answered ${pasted.status}${
              pasted.body ? `: ${pasted.body}` : ""
            }`,
          );
        }

        const after = await readRows();
        const wrong = after.rows
          .map((row, index) => ({ row, index }))
          .filter(({ row, index }) => row.cell !== expected[index])
          .map(
            ({ row, index }) =>
              `${row.label} holds ${JSON.stringify(row.cell)}, expected ${JSON.stringify(expected[index])}`,
          );
        if (wrong.length > 0) {
          throw new Error(
            `the paste landed values on the wrong rows: ${wrong.slice(0, 5).join("; ")}${
              wrong.length > 5 ? ` (and ${wrong.length - 5} more)` : ""
            }`,
          );
        }
        // The label column was never in the paste. If it moved, rows were
        // rewritten rather than cells, which is a different and worse failure.
        const relabelled = after.rows.filter(
          (row, index) => row.label !== `row-${index}`,
        );
        if (relabelled.length > 0) {
          throw new Error(
            `the paste changed rows outside its own column: ${JSON.stringify(relabelled.slice(0, 3))}`,
          );
        }

        // The mechanism behind a shift: a record the loader cannot find has to
        // stop the paste, not be dropped out of a positional payload.
        const missingId = `${recordIds[0].slice(0, 3)}e2elabmissing00000`;
        const refused = await paste(
          [...recordIds, missingId],
          [...expected.map((value) => `${value}-again`), "orphan"],
        );
        if (refused.status < 400 || refused.status >= 500) {
          throw new Error(
            `pasting with a record id that does not exist answered ${refused.status}, expected a 4xx refusal${
              refused.body ? `: ${refused.body}` : ""
            }`,
          );
        }
        const afterRefusal = await readRows();
        const changed = afterRefusal.rows
          .map((row, index) => ({ row, index }))
          .filter(({ row, index }) => row.cell !== expected[index])
          .map(
            ({ row }) => `${row.label} now holds ${JSON.stringify(row.cell)}`,
          );
        if (changed.length > 0) {
          throw new Error(
            `the refused paste answered ${refused.status} but wrote anyway: ${changed.slice(0, 5).join("; ")}`,
          );
        }

        return {
          pasteStatus: pasted.status,
          refusedStatus: refused.status,
          pasteRouting,
        };
      },
    );

    return {
      details: {
        tableId,
        rowCount: config.rowCount,
        routing,
        pasteRouting: probe.pasteRouting,
        pasteStatus: probe.pasteStatus,
        refusedStatus: probe.refusedStatus,
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
