import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  RequiredSelfLinkRingDeleteCaseConfig,
} from "../types";
import { describeResponse, isSuccess, rawRequest } from "./raw-api";

// A table whose rows each point at the next through a required link to the same
// table, the last pointing back at the first -> delete every row with the
// streamed delete -> checkpoint: the stream finishes without errors and the
// table is empty.
//
// The streamed delete works in batches. A batch that removes some rows of the
// ring leaves a surviving row whose required link points at a row that is
// gone, which the required link refuses, so the delete stopped and nothing was
// removed. Rows in a ring can only go together.

const NAME_FIELD = "Name";
const LINK_FIELD = "Next";

export const runRequiredSelfLinkRingDeleteCase = async (
  bugCase: BugCaseFor<"required-self-link-ring-delete">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RequiredSelfLinkRingDeleteCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const createdTableIds: string[] = [];

  if (config.ringSize < 3) {
    throw new Error("a ring needs at least three rows");
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: Array.from({ length: config.ringSize }, (_, index) => ({
        fields: { [NAME_FIELD]: `row-${index}` },
      })),
    });
    createdTableIds.push(table.id);
    const recordIds = table.records.map((record: { id: string }) => record.id);
    if (recordIds.length !== config.ringSize) {
      throw new Error(`the table was created with ${recordIds.length} rows`);
    }

    const link = await createField(table.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: table.id,
      },
    });

    for (
      let start = 0;
      start < recordIds.length;
      start += config.writeBatchSize
    ) {
      const slice = recordIds.slice(start, start + config.writeBatchSize);
      const written = await rawRequest("PATCH", `/table/${table.id}/record`, {
        fieldKeyType: FieldKeyType.Id,
        typecast: false,
        records: slice.map((id, offset) => ({
          id,
          fields: {
            [link.id]: {
              id: recordIds[(start + offset + 1) % recordIds.length],
            },
          },
        })),
      });
      if (!isSuccess(written)) {
        throw new Error(
          `linking the ring answered ${describeResponse(written)}`,
        );
      }
    }
    await convertField(table.id, link.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      notNull: true,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: table.id,
      },
    });

    // Fixture verification, outside the checkpoint: every row points at the
    // next and the link is required.
    const seeded = await apiGetRecords(table.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 1000,
    });
    const unlinked = seeded.data.records.filter(
      (record) => !(record.fields[link.id] as { id?: string } | undefined)?.id,
    );
    if (seeded.data.records.length !== config.ringSize || unlinked.length > 0) {
      throw new Error(
        `the ring is not closed: ${seeded.data.records.length} rows, ${unlinked.length} without a link`,
      );
    }
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-required-ring-deletes-in-one-stream",
      async () => {
        // The stream answers with server-sent events; the last one is the
        // outcome. Sent as a plain request so the session's own credentials go
        // with it.
        const streamed = await rawRequest<string>(
          "PATCH",
          `/table/${table.id}/selection/delete-by-id-stream`,
          {
            selection:
              config.selection === "all" ? { allRecords: true } : { recordIds },
          },
          { Accept: "text/event-stream" },
        );
        if (!isSuccess(streamed)) {
          throw new Error(
            `the delete stream answered ${describeResponse(streamed)}`,
          );
        }
        const events = String(streamed.data)
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => {
            try {
              return JSON.parse(line.slice(6)) as {
                id?: string;
                deletedCount?: number;
                message?: string;
              };
            } catch {
              return { id: "unparsed", message: line.slice(0, 200) };
            }
          });
        const done = events.filter((event) => event.id === "done").at(-1);
        const errors = events.filter(
          (event) => event.id === "error" || event.id === "unparsed",
        );
        const result = {
          errors,
          data: { deletedCount: done?.deletedCount ?? 0 },
        };
        const left = await apiGetRecords(table.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 1000,
        });
        const problems: string[] = [];
        if (result.errors.length > 0) {
          problems.push(
            `the stream reported ${result.errors.length} errors, the first: ${JSON.stringify(result.errors[0]).slice(0, 300)}`,
          );
        }
        if (!done) {
          problems.push(
            `the stream never finished: ${String(streamed.data).slice(-300)}`,
          );
        }
        if (result.data.deletedCount !== config.ringSize) {
          problems.push(
            `the stream deleted ${result.data.deletedCount} of ${config.ringSize}`,
          );
        }
        if (left.data.records.length > 0) {
          problems.push(
            `${left.data.records.length} rows are still in the table`,
          );
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { deletedCount: result.data.deletedCount };
      },
    );

    return { details: { tableId: table.id, routing, ...probe } };
  } finally {
    for (const tableId of createdTableIds) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
