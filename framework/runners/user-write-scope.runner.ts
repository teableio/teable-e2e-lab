import { FieldKeyType, FieldType } from "@teable/core";
import { axios, CREATE_RECORDS, urlBuilder } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UserWriteScopeCaseConfig } from "../types";

// A user field, and a person who has an account on the platform but no part in
// this base -> write a row naming them by email -> checkpoint: the cell does
// not end up holding them.
//
// A member column is a list of the people who work on this base. Filling one
// by typing an email is the ordinary way to use it, and every email typed into
// it was matched against every account on the whole platform. Anyone with an
// account could be written into a base they have nothing to do with, and
// deleted accounts matched too.
//
// What that costs: their name and email are then displayed to everyone in the
// base, they appear in the column's filter and grouping options as though they
// belonged there, and a row of work is recorded against a person nobody in the
// base can talk to. It reads as a directory of the team and it is not one.
//
// The outsider is inserted with SQL because the product has no way to produce
// one on request - every account the API can attach to this base is, by
// construction, part of it. The control is the opposite write in the same run:
// the same request naming someone who does belong here has to land, or "the
// cell is empty" would just mean "this never resolves anyone".

const NAME_FIELD = "Name";
const USER_FIELD = "Assignee";

export const runUserWriteScopeCase = async (
  bugCase: BugCaseFor<"user-write-scope">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UserWriteScopeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  // Unique per run: the row is real platform state, and a leftover from an
  // earlier run must never be what a later one reads.
  const outsiderId = `usre2elab${context.runId}`.replace(/[^a-zA-Z0-9]/g, "");
  const outsiderEmail = `${outsiderId}@e2e-lab.invalid`;
  let tableId = "";
  let outsiderInserted = false;

  try {
    const db = fixtureDb(context.app);
    await db.execute(
      `INSERT INTO "users" ("id", "name", "email") VALUES ($1, $2, $3)
       ON CONFLICT ("id") DO NOTHING`,
      outsiderId,
      config.outsiderName,
      outsiderEmail,
    );
    outsiderInserted = true;

    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: USER_FIELD,
          type: FieldType.User,
          options: { isMultiple: false },
        },
      ],
      records: [],
    });
    tableId = table.id;

    // Raw axios with the status open: a refusal is a correct answer here, and
    // the generated client throws it away along with the body.
    const writeByEmail = async (title: string, email: string) =>
      axios.post(
        urlBuilder(CREATE_RECORDS, { tableId }),
        {
          fieldKeyType: FieldKeyType.Name,
          typecast: true,
          records: [{ fields: { [NAME_FIELD]: title, [USER_FIELD]: email } }],
        },
        { validateStatus: () => true },
      );

    const cellOf = (response: { data?: unknown }) => {
      const records = (
        response.data as { records?: { fields?: Record<string, unknown> }[] }
      )?.records;
      return records?.[0]?.fields?.[USER_FIELD];
    };

    // Control, outside the checkpoint: the same write naming someone who does
    // belong to this base has to land. Without it, a build that resolved
    // nobody at all would look like the fix.
    const insider = await writeByEmail(
      config.insiderRowTitle,
      globalThis.testConfig.email,
    );
    if (insider.status < 200 || insider.status >= 300) {
      throw new Error(
        `writing ${globalThis.testConfig.email} - who is part of this base - answered ${insider.status}: ` +
          `${JSON.stringify(insider.data)}`,
      );
    }
    const insiderCell = cellOf(insider);
    if (!insiderCell) {
      throw new Error(
        "writing a member of this base by email left the cell empty, so an empty cell proves nothing here",
      );
    }

    const probe = await bugCheckpoint(
      "a-member-column-does-not-take-someone-from-outside-the-base",
      async () => {
        const response = await writeByEmail(
          config.outsiderRowTitle,
          outsiderEmail,
        );
        const cell = cellOf(response);
        const holdsOutsider =
          JSON.stringify(cell ?? null).includes(outsiderId) ||
          JSON.stringify(cell ?? null).includes(outsiderEmail);

        // Two answers are correct: refusing the write, and accepting it with
        // the cell left empty the way an email matching nobody is treated.
        // Only holding the outsider is the failure.
        if (holdsOutsider) {
          throw new Error(
            `${outsiderEmail} has an account but no part in this base, and the member column now holds ` +
              `${JSON.stringify(cell)} - their name and email are displayed to everyone here and appear in ` +
              "the column's filter options as though they belonged",
          );
        }
        return { status: response.status, cell: cell ?? null };
      },
    );

    return {
      details: {
        tableId,
        outsiderId,
        insiderCell,
        outsiderWriteStatus: probe.status,
        outsiderCell: probe.cell,
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
    if (outsiderInserted) {
      try {
        await fixtureDb(context.app).execute(
          `DELETE FROM "users" WHERE "id" = $1`,
          outsiderId,
        );
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (user ${outsiderId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
