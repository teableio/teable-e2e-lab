import { FieldType } from "@teable/core";
import {
  createTable,
  getRecord,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  EmptyRecordPatchCaseConfig,
} from "../types";
import { describeResponse, dropTables, rawRequest } from "./raw-api";

// A row with a value -> PATCH it with an empty set of fields -> checkpoint:
// the request is refused as a validation error, and the row is unchanged.
//
// An empty update is what an integration sends when every field it meant to
// write was filtered out on its side - a mapping that matched nothing, a diff
// that found no change. It answered 500, which an integration reads as "the
// server is down, retry", so the same empty request was retried until it gave
// up, and the run was logged as an outage instead of a mapping to fix.

const TEXT_FIELD = "Text";

export const runEmptyRecordPatchCase = async (
  bugCase: BugCaseFor<"empty-record-patch">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: EmptyRecordPatchCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: TEXT_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [TEXT_FIELD]: config.value } }],
    });
    tableIds.push(table.id);
    const recordId = table.records[0].id;
    const textId = table.fields[0].id;
    const read = await rawRequest<{ fields: Record<string, unknown> }>(
      "GET",
      `/table/${table.id}/record/${recordId}`,
    );
    assertServedByV2(read.headers, {
      operation: "GET /table/{tableId}/record/{recordId}",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "an-empty-update-is-refused-as-invalid",
      async () => {
        const patched = await rawRequest<{ code?: string }>(
          "PATCH",
          `/table/${table.id}/record/${recordId}`,
          { record: { fields: {} } },
        );
        const after = (await getRecord(table.id, recordId)).fields[textId];
        const problems: string[] = [];
        if (
          patched.status !== 400 ||
          patched.data?.code !== config.expectedCode
        ) {
          problems.push(
            `an update with no fields answered ${describeResponse(patched)}, expected 400 ${config.expectedCode}`,
          );
        }
        if (after !== config.value) {
          problems.push(`the row now reads ${JSON.stringify(after)}`);
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { status: patched.status };
      },
    );

    return { details: { tableId: table.id, status: probe.status } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
