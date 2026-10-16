import { FieldType, Relationship } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  UnsupportedPrimaryCreateCaseConfig,
} from "../types";
import { describeResponse, dropTables, rawRequest } from "./raw-api";

// Create a table whose only (and so primary) column is a type that cannot
// name rows - a checkbox, an attachment, a button, a link -> checkpoint: each
// request is refused as a validation error naming the reason, and no table is
// left behind.
//
// The primary column is what every link, search result and record title shows
// for a row. A checkbox or a button cannot be that. These requests used to
// fail as something other than the documented validation refusal: the last
// shape before the fix was a 400 whose error code was not the public
// VALIDATION_ERROR, so an integration matching on that code - the way it tells
// "fix your spec" from "try again later" - did not recognise it.

const TABLE_LIST = (baseId: string) => `/base/${baseId}/table`;

export const runUnsupportedPrimaryCreateCase = async (
  bugCase: BugCaseFor<"unsupported-primary-create">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UnsupportedPrimaryCreateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const foreign = await createTable(baseId, {
      name: `${config.tableNamePrefix}-foreign-${context.runId}`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.push(foreign.id);
    const specs: Record<string, unknown>[] = config.types.map((type) =>
      type === FieldType.Link
        ? {
            type,
            name: "Primary link",
            options: {
              relationship: Relationship.ManyMany,
              foreignTableId: foreign.id,
            },
          }
        : { type, name: `Primary ${type}` },
    );
    const listTables = async () => {
      const listed = await rawRequest<{ id: string }[]>(
        "GET",
        TABLE_LIST(baseId),
      );
      return {
        headers: listed.headers,
        ids: listed.data.map((table) => table.id).sort(),
      };
    };
    const before = await listTables();
    assertServedByV2(before.headers, {
      operation: "GET /base/{baseId}/table",
      feature: "getTable",
    });

    const probe = await bugCheckpoint(
      "a-table-cannot-start-with-a-column-that-cannot-name-rows",
      async () => {
        const problems: string[] = [];
        const answers: Record<string, unknown> = {};
        for (const [index, spec] of specs.entries()) {
          const created = await rawRequest<{
            id?: string;
            message?: string;
            code?: string;
          }>("POST", TABLE_LIST(baseId), {
            name: `${config.tableNamePrefix}-${String(spec.type)}-${context.runId}`,
            fields: [spec],
          });
          if (created.data?.id) {
            tableIds.push(created.data.id);
          }
          answers[String(spec.type)] = {
            status: created.status,
            code: created.data?.code,
          };
          const message = String(created.data?.message ?? "");
          if (
            created.status !== 400 ||
            created.data?.code !== config.expectedCode ||
            !message.includes(config.types[index]) ||
            !/not supported as primary/i.test(message)
          ) {
            problems.push(
              `a ${String(spec.type)} primary answered ${describeResponse(created)}, expected 400 with code ${config.expectedCode} saying the type is not supported as primary`,
            );
          }
        }
        const after = await listTables();
        const added = after.ids.filter((id) => !before.ids.includes(id));
        if (added.length > 0) {
          problems.push(`${added.length} table(s) were created anyway`);
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return answers;
      },
    );

    return { details: { answers: probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
