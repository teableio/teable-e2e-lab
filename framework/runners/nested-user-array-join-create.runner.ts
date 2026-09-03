import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  CREATE_RECORD,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NestedUserArrayJoinCreateCaseConfig } from "../types";

// A table with several people columns and one formula joining them together,
// wrapped four functions deep -> add a row -> checkpoint: the row is added.
//
// "Everyone involved, listed once, separated by commas" is what that formula
// says: flatten the people columns into one list, drop the empties, drop the
// repeats, join what is left. Each of those four steps re-stated the whole of
// the step inside it, so the statement the database was asked to plan grew with
// every layer. At seven people columns it reached megabytes.
//
// The row is recomputed inside the write, so nothing came back at all: the page
// spun and the gateway eventually gave up. The table could not accept a row -
// not slowly, at all - and the only thing a person could see was a timeout.
//
// So the checkpoint's question is simply whether the write returns. It carries
// its own time limit rather than letting the request hang, because a request
// that never answers would end the case as "could not run" instead of as the
// bug it is.

const NAME_FIELD = "Name";
const CAMPUS_FIELD = "Campus";
const LINK_FIELD = "Session";
const CAMPUS_LOOKUP_FIELD = "Campus, borrowed";
const JOINED_FIELD = "Everyone involved";

export const runNestedUserArrayJoinCreateCase = async (
  bugCase: BugCaseFor<"nested-user-array-join-create">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NestedUserArrayJoinCreateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];
  const person = {
    id: globalThis.testConfig.userId,
    title: globalThis.testConfig.userName,
  };

  if (config.peopleColumns < 2) {
    throw new Error(
      "at least two people columns, or there is nothing to flatten together",
    );
  }

  try {
    // The other table, and the column borrowed from it. The borrowed column is
    // part of the reported shape: it is what puts a second computed column in
    // the same write.
    const sessions = await createTable(baseId, {
      name: `${suffix}-sessions`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CAMPUS_FIELD, type: FieldType.LongText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.sessionRowName,
            [CAMPUS_FIELD]: config.campusValue,
          },
        },
      ],
    });
    createdTableIds.unshift(sessions.id);
    const campusFieldId = sessions.fields.find(
      (field: { name: string }) => field.name === CAMPUS_FIELD,
    )?.id as string;

    const notes = await createTable(baseId, {
      name: `${suffix}-notes`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(notes.id);
    const notesNameId = notes.fields[0].id;

    const peopleFieldIds: string[] = [];
    for (let index = 0; index < config.peopleColumns; index += 1) {
      const field = await createField(notes.id, {
        name: `${config.peopleColumnPrefix} ${index + 1}`,
        type: FieldType.User,
        options: { isMultiple: false, shouldNotify: false },
      });
      peopleFieldIds.push(field.id);
    }

    const link = await createField(notes.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneOne,
        foreignTableId: sessions.id,
      },
    });
    await createField(notes.id, {
      name: CAMPUS_LOOKUP_FIELD,
      type: FieldType.LongText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sessions.id,
        linkFieldId: link.id,
        lookupFieldId: campusFieldId,
      },
    });

    const flattenArgs = peopleFieldIds
      .map((fieldId) => `{${fieldId}}`)
      .join(", ");
    const expression = `ARRAY_JOIN(ARRAY_UNIQUE(ARRAY_COMPACT(ARRAY_FLATTEN(${flattenArgs}))), "${config.separator}")`;

    // Fixture verification, outside the checkpoint: the table reads before
    // anything is written to it, and the engine assertion rides on that read.
    const before = await apiGetRecords(notes.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 1,
    });
    if (before.data.records.length !== 0) {
      throw new Error("the table was expected to be empty before the write");
    }
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-row-can-be-added-to-a-table-whose-formula-joins-people-columns",
      async () => {
        // The formula is made HERE, not in setup. What grew a layer at a time
        // is the statement, and planning it is what fails - so it fails when the
        // column is made as readily as when a row is added. Building it outside
        // would score that first failure as "this case could not run here",
        // which is the one verdict that hides the bug.
        await createField(notes.id, {
          name: JOINED_FIELD,
          type: FieldType.Formula,
          options: { expression },
        });

        const startedAt = Date.now();
        // Raw axios with its own time limit. A request that never answers would
        // run out the whole case and be reported as "could not run"; this way
        // the wait ends here, inside the checkpoint, which is the report.
        const response = await axios
          .post(
            urlBuilder(CREATE_RECORD, { tableId: notes.id }),
            {
              fieldKeyType: FieldKeyType.Id,
              typecast: false,
              records: [
                {
                  fields: Object.fromEntries([
                    [notesNameId, config.noteRowName],
                    ...peopleFieldIds.map((fieldId) => [fieldId, person]),
                  ]),
                },
              ],
            },
            {
              validateStatus: () => true,
              timeout: config.writeBudgetMs,
            },
          )
          .catch((error: { code?: string; message?: string }) => {
            throw new Error(
              `adding a row did not answer within ${config.writeBudgetMs}ms ` +
                `(${error.code ?? "no code"}: ${error.message ?? "no message"}) - ` +
                `the table cannot accept a row at all`,
            );
          });
        const elapsedMs = Date.now() - startedAt;

        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `adding a row answered ${response.status} after ${elapsedMs}ms: ` +
              (typeof response.data === "string"
                ? response.data
                : JSON.stringify(response.data)),
          );
        }
        const recordId = (response.data as { records?: { id?: string }[] })
          ?.records?.[0]?.id;
        if (!recordId) {
          throw new Error(
            `adding a row returned no row after ${elapsedMs}ms: ${JSON.stringify(response.data)}`,
          );
        }

        // And the table reads afterwards, with the row in it.
        const after = await apiGetRecords(notes.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 5,
        });
        if (after.data.records.length !== 1) {
          throw new Error(
            `the write answered but the table lists ${after.data.records.length} rows`,
          );
        }
        return {
          recordId,
          elapsedMs,
          joined: after.data.records[0]?.fields ?? {},
        };
      },
    );

    return {
      details: {
        sessionsTableId: sessions.id,
        notesTableId: notes.id,
        peopleColumns: config.peopleColumns,
        routing,
        recordId: probe.recordId,
        writeMs: probe.elapsedMs,
      },
    };
  } finally {
    for (const tableId of createdTableIds) {
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
