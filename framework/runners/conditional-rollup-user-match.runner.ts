import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ConditionalRollupUserMatchCaseConfig } from "../types";

// A column totalling the hours of tasks owned by any of this row's people ->
// checkpoint: the total is the hours of their tasks.
//
// "How much work is on my team" is the question a column like this answers.
// The project row lists who is on it, the task rows each have one owner, and
// the total is over the tasks owned by anyone on the list.
//
// The comparison never matched. One person on a task and several on a project
// are the same kind of thing written two ways, and asking whether the one is
// among the several answered no every time - so the column read zero on every
// row, for teams with plenty of work assigned to them.
//
// Zero is the worst possible wrong answer here: it looks like an empty week
// rather than a broken column, and it is the number a person would act on.
//
// A row with nobody on it is read as well, because a column that totals
// everything regardless of the condition also gets the first row right.

const NAME_FIELD = "Name";
const OWNER_FIELD = "Owner";
const HOURS_FIELD = "Hours";
const TEAM_FIELD = "Team";
const TOTAL_FIELD = "Hours on this team";

export const runConditionalRollupUserMatchCase = async (
  bugCase: BugCaseFor<"conditional-rollup-user-match">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalRollupUserMatchCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];
  const person = {
    id: globalThis.testConfig.userId,
    title: globalThis.testConfig.userName,
  };

  if (config.ownedHours.length === 0) {
    throw new Error(
      "at least one task owned by the person, or the expected total is zero and zero is what the broken column returns",
    );
  }
  if (config.unownedHours.length === 0) {
    throw new Error(
      "at least one task owned by nobody, or a column that totals everything regardless of who owns it would look correct",
    );
  }

  try {
    const tasks = await createTable(baseId, {
      name: `${suffix}-tasks`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: OWNER_FIELD,
          type: FieldType.User,
          options: { isMultiple: false, shouldNotify: false },
        },
        { name: HOURS_FIELD, type: FieldType.Number },
      ],
      records: [
        ...config.ownedHours.map((hours, index) => ({
          fields: {
            [NAME_FIELD]: `owned-${index}`,
            [OWNER_FIELD]: person,
            [HOURS_FIELD]: hours,
          },
        })),
        ...config.unownedHours.map((hours, index) => ({
          fields: { [NAME_FIELD]: `unowned-${index}`, [HOURS_FIELD]: hours },
        })),
      ],
    });
    createdTableIds.unshift(tasks.id);
    const ownerFieldId = tasks.fields.find(
      (field: { name: string }) => field.name === OWNER_FIELD,
    )?.id;
    const hoursFieldId = tasks.fields.find(
      (field: { name: string }) => field.name === HOURS_FIELD,
    )?.id;
    if (!ownerFieldId || !hoursFieldId) {
      throw new Error("the tasks table is not in place");
    }

    const projects = await createTable(baseId, {
      name: `${suffix}-projects`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: TEAM_FIELD,
          type: FieldType.User,
          options: { isMultiple: true, shouldNotify: false },
        },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.staffedRowName,
            [TEAM_FIELD]: [person],
          },
        },
        { fields: { [NAME_FIELD]: config.emptyRowName } },
      ],
    });
    createdTableIds.unshift(projects.id);
    const teamFieldId = projects.fields.find(
      (field: { name: string }) => field.name === TEAM_FIELD,
    )?.id;
    if (!teamFieldId) {
      throw new Error("the projects table is not in place");
    }

    // The column: the hours of tasks whose one owner is among this row's
    // several people.
    const total = await createField(projects.id, {
      name: TOTAL_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        foreignTableId: tasks.id,
        lookupFieldId: hoursFieldId,
        expression: "sum({values})",
        filter: {
          conjunction: "and",
          filterSet: [
            {
              fieldId: ownerFieldId,
              operator: "is",
              value: { type: "field", fieldId: teamFieldId },
            },
          ],
        },
      },
    });

    const readTotals = async () => {
      const read = await apiGetRecords(projects.id, {
        fieldKeyType: FieldKeyType.Name,
        take: 5,
      });
      return new Map<string, number>(
        read.data.records.map((record: { fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD]),
          Number(record.fields[TOTAL_FIELD] ?? 0),
        ]),
      );
    };

    // Fixture verification, outside the checkpoint: the person is on the
    // staffed row's team. Without that the column would be right to total
    // nothing, and the case would be asserting the wrong thing.
    const seeded = await apiGetRecords(projects.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const teamCell = seeded.data.records.find(
      (record: { fields: Record<string, unknown> }) =>
        String(record.fields[projects.fields[0].id]) === config.staffedRowName,
    )?.fields[teamFieldId];
    const teamIds = (Array.isArray(teamCell) ? teamCell : []).map(
      (entry) => (entry as { id?: string })?.id,
    );
    if (!teamIds.includes(person.id)) {
      throw new Error(
        `the staffed row's team is ${JSON.stringify(teamCell)}, expected to include the person who owns the tasks`,
      );
    }

    const expectedTotal = config.ownedHours.reduce(
      (sum, hours) => sum + hours,
      0,
    );

    const probe = await bugCheckpoint(
      "hours-owned-by-anyone-on-this-row-are-totalled",
      async () => {
        let totals = new Map<string, number>();
        for (let attempt = 0; attempt < config.settleAttempts; attempt += 1) {
          totals = await readTotals();
          if ((totals.get(config.staffedRowName) ?? 0) !== 0) {
            break;
          }
          await new Promise((resolve) =>
            setTimeout(resolve, config.settleIntervalMs),
          );
        }

        const staffed = totals.get(config.staffedRowName) ?? 0;
        if (staffed !== expectedTotal) {
          throw new Error(
            `the row totals ${staffed} hours, expected ${expectedTotal} - ` +
              (staffed === 0
                ? "asking whether the one person on a task is among the several on this row answered no every time, and zero looks like an empty week rather than a broken column"
                : "the wrong tasks were counted"),
          );
        }
        const empty = totals.get(config.emptyRowName) ?? 0;
        if (empty !== 0) {
          throw new Error(
            `the row with nobody on it totals ${empty} hours, expected 0 - the column is totalling regardless of who owns the task`,
          );
        }
        return { staffed, empty };
      },
    );

    return {
      details: {
        projectsTableId: projects.id,
        tasksTableId: tasks.id,
        totalFieldId: total.id,
        staffedTotal: probe.staffed,
        emptyTotal: probe.empty,
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
