import { Colors, FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { SelectRollupUniqueAndCountCaseConfig } from "../types";

// A parent row summarising a choice column across the children it is linked to
// -> checkpoint: the distinct values come back in the order they first appear,
// and the count is of distinct values.
//
// Two wrong answers from one column type. "Todo" then "Done" came back as
// "Done, Todo" - sorted, not in the order of the rows - so the summary
// disagreed with the list beside it, which was right. And when both children
// said "Todo", the count of distinct values answered 2: it was counting rows.
//
// Neither looks broken. A reordered list of two words reads as an arbitrary
// choice rather than a fault, and 2 is the number of children, so it is a
// number somebody can believe. What makes them findable at all is the other
// summaries over the same column - join and compact - which are correct, so the
// row shows "Todo, Done" and "Done, Todo" side by side.
//
// Those two ride along as the control. They take the same path from the same
// source, so if they are wrong too, this is not the distinct-values bug.

const NAME_FIELD = "Name";
const STATUS_FIELD = "Status";
const LINK_FIELD = "Children";
const JOIN_FIELD = "Joined";
const COMPACT_FIELD = "Compacted";
const UNIQUE_FIELD = "Distinct, in order";
const COUNT_FIELD = "How many distinct";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const firstAppearanceUnique = (values: string[]) => [...new Set(values)];

export const runSelectRollupUniqueAndCountCase = async (
  bugCase: BugCaseFor<"select-rollup-unique-and-count">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: SelectRollupUniqueAndCountCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  const initialStatuses = config.children.map((child) => child.status);
  const initialUnique = firstAppearanceUnique(initialStatuses);
  if (initialUnique.length < 2) {
    throw new Error(
      "the children need at least two different choices, or there is no order to get wrong",
    );
  }
  if (
    JSON.stringify(initialUnique) === JSON.stringify([...initialUnique].sort())
  ) {
    throw new Error(
      `the children's choices ${JSON.stringify(initialUnique)} are already in alphabetical order - ` +
        "a summary that sorted them instead of keeping the row order would look correct",
    );
  }

  const afterStatuses = config.children.map((child) =>
    child.name === config.retarget.childName
      ? config.retarget.status
      : child.status,
  );
  const afterUnique = firstAppearanceUnique(afterStatuses);
  if (afterUnique.length >= afterStatuses.length) {
    throw new Error(
      `after the edit the children hold ${JSON.stringify(afterStatuses)}, all different - ` +
        "counting rows and counting distinct values would give the same answer",
    );
  }
  if (
    !config.children.some((child) => child.name === config.retarget.childName)
  ) {
    throw new Error(
      `there is no child called ${JSON.stringify(config.retarget.childName)} to edit`,
    );
  }

  const choices = [...new Set([...initialStatuses, config.retarget.status])];

  try {
    const children = await createTable(baseId, {
      name: `${suffix}-children`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS_FIELD,
          type: FieldType.SingleSelect,
          options: {
            choices: choices.map((name) => ({ name, color: Colors.Blue })),
          },
        },
      ],
      records: config.children.map((child) => ({
        fields: { [NAME_FIELD]: child.name, [STATUS_FIELD]: child.status },
      })),
    });
    createdTableIds.unshift(children.id);
    const statusFieldId = children.fields.find(
      (field: { name: string }) => field.name === STATUS_FIELD,
    )?.id as string;
    const childIdByName = new Map<string, string>(
      children.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[NAME_FIELD]),
          record.id,
        ],
      ),
    );

    const parent = await createTable(baseId, {
      name: `${suffix}-parent`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(parent.id);
    const linkField = await createField(parent.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: children.id,
      },
    });

    // The link is written in the children's declared order, which is the order
    // the summary is supposed to keep.
    const writeTheRow = async () =>
      apiCreateRecords(parent.id, {
        fieldKeyType: FieldKeyType.Name,
        typecast: false,
        records: [
          {
            fields: {
              [NAME_FIELD]: config.parentRowName,
              [LINK_FIELD]: config.children.map((child) => ({
                id: childIdByName.get(child.name) as string,
              })),
            },
          },
        ],
      });

    // Which comes first, the row or the summaries. Adding a summary to a table
    // that already holds rows fills it in as one job; writing a row into a table
    // whose summaries already exist works them out as part of the write. Those
    // are different paths and they have been wrong separately.
    if (config.whenTheRowIsWritten === "beforeTheSummaries") {
      await writeTheRow();
    }

    const summary = async (name: string, expression: string) =>
      createField(parent.id, {
        name,
        type: FieldType.Rollup,
        options: { expression },
        lookupOptions: {
          foreignTableId: children.id,
          linkFieldId: linkField.id,
          lookupFieldId: statusFieldId,
        },
      });
    await summary(JOIN_FIELD, "array_join({values})");
    await summary(COMPACT_FIELD, "array_compact({values})");
    await summary(UNIQUE_FIELD, "array_unique({values})");
    await summary(COUNT_FIELD, "count({values})");

    if (config.whenTheRowIsWritten === "afterTheSummaries") {
      // The row first, then the links, as two writes. That is what a script
      // does - create the parent, then attach the children - and it is the
      // sequence the report follows. Writing both at once is a different path
      // and is answered correctly on both sides of this fix.
      const created = await apiCreateRecords(parent.id, {
        fieldKeyType: FieldKeyType.Name,
        typecast: false,
        records: [{ fields: { [NAME_FIELD]: config.parentRowName } }],
      });
      const parentRowId = created.data.records[0]?.id;
      if (!parentRowId) {
        throw new Error("the parent row was not created");
      }
      await apiUpdateRecord(parent.id, parentRowId, {
        fieldKeyType: FieldKeyType.Name,
        record: {
          fields: {
            [LINK_FIELD]: config.children.map((child) => ({
              id: childIdByName.get(child.name) as string,
            })),
          },
        },
      });
    }

    const readParent = async () => {
      const response = await apiGetRecords(parent.id, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      return {
        headers: response.headers,
        fields: response.data.records[0]?.fields ?? {},
      };
    };

    // Settling on the CONTROL, which is correct on both sides of the fix:
    // waiting for the computation to finish rather than for the bug.
    const settleOnControl = async (expectedJoined: string[]) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let seen = await readParent();
      for (;;) {
        const joined = seen.fields[JOIN_FIELD];
        const asList = Array.isArray(joined)
          ? joined.map(String)
          : String(joined ?? "")
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean);
        if (
          JSON.stringify(asList) === JSON.stringify(expectedJoined) ||
          Date.now() >= deadline
        ) {
          return seen;
        }
        await sleep(config.pollIntervalMs);
        seen = await readParent();
      }
    };

    const settled = await settleOnControl(initialStatuses);
    const routing = assertServedByV2(settled.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const asList = (value: unknown) =>
      Array.isArray(value)
        ? value.map(String)
        : String(value ?? "")
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);

    const probe = await bugCheckpoint(
      "distinct-choices-come-back-in-the-order-they-appear",
      async () => {
        const check = (
          seen: Record<string, unknown>,
          expectedUnique: string[],
          when: string,
        ) => {
          const scene = {
            when,
            joined: seen[JOIN_FIELD] ?? null,
            compacted: seen[COMPACT_FIELD] ?? null,
            distinct: seen[UNIQUE_FIELD] ?? null,
            howManyDistinct: seen[COUNT_FIELD] ?? null,
          };

          // The control first. Join and compact take the same path from the
          // same column; if they are wrong, this is not the distinct-values bug.
          const joined = asList(seen[JOIN_FIELD]);
          const compacted = asList(seen[COMPACT_FIELD]);
          const rowOrder =
            when === "at first" ? initialStatuses : afterStatuses;
          if (
            JSON.stringify(joined) !== JSON.stringify(rowOrder) ||
            JSON.stringify(compacted) !== JSON.stringify(rowOrder)
          ) {
            throw new Error(
              `the summaries that are not under test disagree with the rows ${JSON.stringify(rowOrder)} ` +
                `${when}: ${JSON.stringify(scene)}. The whole summary is wrong, not the distinct values`,
            );
          }

          // Every wrong answer at once, rather than the first. The two halves
          // of this report are separate faults in the same column, and a
          // failure that stopped at the order would leave the count untested on
          // exactly the commits where it is broken.
          const problems: string[] = [];

          const distinct = asList(seen[UNIQUE_FIELD]);
          if (JSON.stringify(distinct) !== JSON.stringify(expectedUnique)) {
            problems.push(
              `the distinct choices come back as ${JSON.stringify(distinct)}, ` +
                `expected ${JSON.stringify(expectedUnique)} - the order the rows are in`,
            );
          }
          const howMany = Number(seen[COUNT_FIELD]);
          if (howMany !== expectedUnique.length) {
            problems.push(
              `the count of distinct choices reads ${JSON.stringify(seen[COUNT_FIELD])}, ` +
                `expected ${expectedUnique.length}` +
                (howMany === rowOrder.length
                  ? " - which is the number of linked rows, so it is counting rows"
                  : ""),
            );
          }
          return { scene, problems };
        };

        // Both phases run even if the first found something. The two halves of
        // this report are separate faults in one column, and stopping at the
        // order would leave the count undemonstrated on exactly the commits
        // where it is broken - the order is wrong there first, and the count
        // only becomes wrong once two children agree.
        const first = check(settled.fields, initialUnique, "at first");

        if (!config.alsoCheckAfterAnEdit) {
          if (first.problems.length > 0) {
            throw new Error(
              `${first.problems.join("; ")}. The row read ${JSON.stringify(first.scene)}`,
            );
          }
          return { first: first.scene, second: null };
        }

        // The second half of the report: make two children agree, so the count
        // of distinct values and the count of rows stop being the same number.
        await apiUpdateRecord(
          children.id,
          childIdByName.get(config.retarget.childName) as string,
          {
            fieldKeyType: FieldKeyType.Id,
            record: { fields: { [statusFieldId]: config.retarget.status } },
          },
        );
        const after = await settleOnControl(afterStatuses);
        const second = check(after.fields, afterUnique, "after the edit");

        const problems = [
          ...first.problems.map((problem) => `at first, ${problem}`),
          ...second.problems.map((problem) => `after the edit, ${problem}`),
        ];
        if (problems.length > 0) {
          throw new Error(
            `${problems.join("; ")}. The row read ${JSON.stringify(first.scene)} ` +
              `and then ${JSON.stringify(second.scene)}`,
          );
        }

        return { first: first.scene, second: second.scene };
      },
    );

    return {
      details: {
        childrenTableId: children.id,
        parentTableId: parent.id,
        routing,
        ...probe,
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
