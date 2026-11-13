import { FieldKeyType, FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  PasteRecPrefixedTextCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A text column -> paste a column of ordinary values that happen to start
// with "rec", one of them shaped exactly like a record id -> checkpoint: every
// cell holds the text pasted into it.
//
// Paste treats a value that looks like a record id as a reference, which is
// right for link columns. It applied that to text columns too, so values such
// as part numbers or codes starting with "rec" were dropped or rewritten.

const NAME = "Name";

export const runPasteRecPrefixedTextCase = async (
  bugCase: BugCaseFor<"paste-rec-prefixed-text">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: PasteRecPrefixedTextCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: config.values.map((_, index) => ({
        fields: { [NAME]: `seed-${index}` },
      })),
    });
    tableIds.push(table.id);
    const viewId = table.views[0].id;

    const probe = await bugCheckpoint(
      "pasted-rec-prefixed-text-stays-literal",
      async () => {
        const pasted = await rawRequest(
          "PATCH",
          `/table/${table.id}/selection/paste`,
          {
            viewId,
            ranges: [
              [0, 0],
              [0, config.values.length - 1],
            ],
            content: config.values.join("\n"),
          },
        );
        if (!isSuccess(pasted)) {
          throw new Error(`the paste answered ${describeResponse(pasted)}`);
        }
        const read = await rawRequest<{
          records: { fields: Record<string, unknown> }[];
        }>(
          "GET",
          `/table/${table.id}/record?viewId=${viewId}&fieldKeyType=${FieldKeyType.Name}`,
        );
        const cells = (read.data.records ?? []).map(
          (record) => record.fields[NAME] ?? null,
        );
        const wrong = config.values
          .map((value, index) => ({ value, got: cells[index] }))
          .filter(({ value, got }) => got !== value)
          .map(
            ({ value, got }) =>
              `${JSON.stringify(value)} became ${JSON.stringify(got)}`,
          );
        if (wrong.length > 0) {
          throw new Error(
            `pasting text that starts with "rec" changed it: ${wrong.join("; ")}`,
          );
        }
        return { cells };
      },
    );
    return { details: { tableId: table.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
