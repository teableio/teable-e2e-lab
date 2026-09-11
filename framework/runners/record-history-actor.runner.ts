import { FieldKeyType, FieldType, Role } from "@teable/core";
import type { IUserMeVo } from "@teable/openapi";
import {
  axios,
  emailSpaceInvitation,
  getRecordHistory as apiGetRecordHistory,
  updateRecord as apiUpdateRecord,
  urlBuilder,
  UPDATE_RECORD,
  USER_ME,
} from "@teable/openapi";
import { createNewUserAxios } from "../../../utils/axios-instance/new-user";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RecordHistoryActorCaseConfig } from "../types";

// Two people editing rows of the same table at the same time -> checkpoint: each
// row's history names the person who changed it.
//
// A row's history is the answer to "who changed this". It is read when a number
// looks wrong, when a customer's record says something nobody expected, and in
// the conversation that follows. Naming the wrong colleague is worse than
// naming nobody: it is a confident, checkable-looking answer that sends the
// question to somebody who was not there.
//
// The history entries are written after the request answers, on a queue shared
// by everyone working in that base. Who made the change was read at the moment
// the queue was drained rather than carried on the change itself, so whoever's
// request happened to trigger the drain was stamped onto everybody's entries.
// One person working alone never sees it. Two people working at once do.
//
// The case writes as both people at the same time and then asks each row who
// changed it. Rows are written one each so every answer has exactly one correct
// value, which is what makes a wrong attribution unambiguous rather than a
// question of ordering.

const NAME_FIELD = "Name";
const NOTE_FIELD = "Note";
const SECOND_WRITER_EMAIL = "e2e-lab-second-writer@example.com";
const SECOND_WRITER_PASSWORD = "12345678a";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runRecordHistoryActorCase = async (
  bugCase: BugCaseFor<"record-history-actor">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RecordHistoryActorCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const spaceId = globalThis.testConfig.spaceId;
  const firstUserId = globalThis.testConfig.userId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.rowsPerWriter < 2) {
    throw new Error(
      "each writer needs at least two rows - with one each, a drain that stamped everything with the same " +
        "person could still be right half the time by accident",
    );
  }

  try {
    // The second person. Signing up is idempotent - the helper signs in when
    // the address is taken - and the invitation is tolerated when they are
    // already in the space from an earlier run.
    const secondAxios = await createNewUserAxios({
      email: SECOND_WRITER_EMAIL,
      password: SECOND_WRITER_PASSWORD,
    });
    const secondUser = (await secondAxios.get<IUserMeVo>(USER_ME)).data;
    try {
      await emailSpaceInvitation({
        spaceId,
        emailSpaceInvitationRo: {
          role: Role.Editor,
          emails: [SECOND_WRITER_EMAIL],
        },
      });
    } catch {
      // Already a collaborator from an earlier run, which is the state this
      // needs anyway.
    }
    if (secondUser.id === firstUserId) {
      throw new Error(
        "the second writer signed in as the first one - there is only one person here and nothing can cross",
      );
    }

    const rows = Array.from(
      { length: config.rowsPerWriter * 2 },
      (_, index) => ({
        name: `row-${index}`,
        // Even rows are the first person's, odd rows the second's.
        writer: index % 2 === 0 ? "first" : "second",
      }),
    );
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NOTE_FIELD, type: FieldType.SingleLineText },
      ],
      records: rows.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [NOTE_FIELD]: "before" },
      })),
    });
    tableId = table.id;
    const noteFieldId = table.fields.find(
      (field: { name: string }) => field.name === NOTE_FIELD,
    )?.id as string;
    const created = table.records as { id: string }[];
    if (!noteFieldId || created.length !== rows.length) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    // Fixture verification, outside the checkpoint: the second person really
    // can write to this table. If they cannot, every row would be the first
    // person's and the case would be watching one writer.
    const probeWrite = await secondAxios.patch(
      urlBuilder(UPDATE_RECORD, { tableId, recordId: created[1]!.id }),
      {
        fieldKeyType: FieldKeyType.Id,
        record: { fields: { [noteFieldId]: "second-can-write" } },
      },
      { validateStatus: () => true },
    );
    if (probeWrite.status !== 200) {
      throw new Error(
        `the second person cannot write to the table (${probeWrite.status}): ${JSON.stringify(probeWrite.data)}`,
      );
    }
    assertServedByV2(probeWrite.headers, {
      operation: "PATCH /table/{tableId}/record/{recordId}",
      feature: "updateRecord",
    });

    const probe = await bugCheckpoint(
      "a-rows-history-names-who-changed-it",
      async () => {
        // Both people writing at once, interleaved, so the entries of one are
        // being written while the other's requests are still arriving.
        await Promise.all(
          created.map((record, index) => {
            const asSecond = rows[index]!.writer === "second";
            const value = `${rows[index]!.writer}-wrote-this`;
            return asSecond
              ? secondAxios.patch(
                  urlBuilder(UPDATE_RECORD, { tableId, recordId: record.id }),
                  {
                    fieldKeyType: FieldKeyType.Id,
                    record: { fields: { [noteFieldId]: value } },
                  },
                )
              : apiUpdateRecord(tableId, record.id, {
                  fieldKeyType: FieldKeyType.Id,
                  record: { fields: { [noteFieldId]: value } },
                });
          }),
        );

        const expectedBy = (index: number) =>
          rows[index]!.writer === "second" ? secondUser.id : firstUserId;

        // The entries are written after the requests answer, so the rows are
        // asked together and under one deadline rather than one after another:
        // twelve rows each waiting out their own timeout is twelve times the
        // wait, and the case would time out rather than report anything.
        const named = new Map<string, string>();
        const deadline = Date.now() + config.historyTimeoutMs;
        for (;;) {
          const pending = created.filter((record) => !named.has(record.id));
          if (pending.length === 0 || Date.now() >= deadline) {
            break;
          }
          const answers = await Promise.all(
            pending.map(async (record) => ({
              id: record.id,
              latest: (await apiGetRecordHistory(tableId, record.id, {})).data
                .historyList?.[0],
            })),
          );
          for (const answer of answers) {
            if (answer.latest) {
              named.set(answer.id, String(answer.latest.createdBy));
            }
          }
          if (named.size < created.length) {
            await sleep(config.pollIntervalMs);
          }
        }
        const attribution = created.map((record, index) => ({
          row: rows[index]!.name,
          expected: expectedBy(index),
          named: named.get(record.id) ?? null,
        }));

        const missing = attribution.filter((entry) => entry.named === null);
        if (missing.length > 0) {
          throw new Error(
            `${missing.length} of ${attribution.length} rows have no history at all after ` +
              `${config.historyTimeoutMs}ms - this case is about who the history names, and there is none`,
          );
        }
        const wrong = attribution.filter(
          (entry) => entry.named !== entry.expected,
        );
        if (wrong.length > 0) {
          throw new Error(
            `${wrong.length} of ${attribution.length} rows name somebody who did not change them: ` +
              `${JSON.stringify(wrong.slice(0, 3))} - the history is what "who changed this" is answered from`,
          );
        }
        return { rows: attribution.length };
      },
    );

    return {
      details: {
        tableId,
        secondWriterId: secondUser.id,
        rowsChecked: probe.rows,
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
