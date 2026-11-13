import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createBase,
  createField,
  createSpace,
  createTable,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  DuplicateBaseFilteredRollupCaseConfig,
} from "../types";
import { describeResponse, isSuccess, rawRequest, sleep } from "./raw-api";

// A base where parents count their children with countall rollups filtered
// on a single-select status (is, is not, is any of) -> duplicate the base with
// its records -> checkpoint: every rollup in the copy reads what it reads in
// the original, parent by parent.
//
// Duplicating a base recomputes its computed columns in the copy. Filtered
// rollups over a single select came out wrong there - the filter dropped or
// the count reset - so a copied project silently disagreed with the one it was
// copied from, in exactly the summary columns people build dashboards on.

const NAME = "Name";
const STATUS = "Status";

type Row = { fields: Record<string, unknown> };

export const runDuplicateBaseFilteredRollupCase = async (
  bugCase: BugCaseFor<"duplicate-base-filtered-rollup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateBaseFilteredRollupCaseConfig = bugCase.config;
  const prefix = `${config.namePrefix}-${context.runId}`;
  let spaceId = "";

  try {
    spaceId = (await createSpace({ name: prefix })).id;
    const baseId = (await createBase({ spaceId, name: `${prefix}-source` })).id;
    const parents = await createTable(baseId, {
      name: "Parents",
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: [
        { fields: { [NAME]: "Mixed" } },
        { fields: { [NAME]: "Zero" } },
      ],
    });
    const children = await createTable(baseId, {
      name: "Children",
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: STATUS,
          type: FieldType.SingleSelect,
          options: {
            choices: [
              { name: "Pending" },
              { name: "Active" },
              { name: "Removed" },
            ],
          },
        },
      ],
      records: config.children.map((child) => ({
        fields: { [NAME]: child.name, [STATUS]: child.status },
      })),
    });
    const parentLink = await createField(children.id, {
      name: "Parent",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: parents.id,
      },
    });
    const childrenLinkId = (parentLink.options as { symmetricFieldId: string })
      .symmetricFieldId;
    const parentIdByName = new Map(
      (
        parents.records as { id: string; fields: Record<string, unknown> }[]
      ).map((record) => [String(record.fields[NAME]), record.id]),
    );
    for (const [index, child] of config.children.entries()) {
      await rawRequest(
        "PATCH",
        `/table/${children.id}/record/${children.records[index].id}`,
        {
          fieldKeyType: FieldKeyType.Id,
          record: {
            fields: {
              [parentLink.id]: { id: parentIdByName.get(child.parent) },
            },
          },
        },
      );
    }
    const statusId = children.fields[1].id;
    for (const rollup of config.rollups) {
      await createField(parents.id, {
        name: rollup.name,
        type: FieldType.Rollup,
        options: { expression: "countall({values})" },
        lookupOptions: {
          foreignTableId: children.id,
          linkFieldId: childrenLinkId,
          lookupFieldId: statusId,
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: statusId,
                operator: rollup.operator,
                value: rollup.value,
              },
            ],
          },
        },
      });
    }

    const readCounts = async (tableId: string) => {
      const read = await rawRequest<{ records?: Row[] }>(
        "GET",
        `/table/${tableId}/record?fieldKeyType=${FieldKeyType.Name}`,
      );
      return Object.fromEntries(
        [...(read.data.records ?? [])]
          .sort((a, b) =>
            String(a.fields[NAME]).localeCompare(String(b.fields[NAME])),
          )
          .map((record) => [
            String(record.fields[NAME]),
            Object.fromEntries(
              config.rollups.map((rollup) => [
                rollup.name,
                Number(record.fields[rollup.name] ?? 0),
              ]),
            ),
          ]),
      );
    };
    const source = await readCounts(parents.id);
    if (JSON.stringify(source) !== JSON.stringify(config.expected)) {
      throw new Error(
        `the original base counts ${JSON.stringify(source)}, expected ${JSON.stringify(config.expected)} - the fixture is not what the case expects`,
      );
    }

    const probe = await bugCheckpoint(
      "a-duplicated-base-keeps-its-filtered-rollups",
      async () => {
        const duplicated = await rawRequest<{ id?: string }>(
          "POST",
          "/base/duplicate",
          {
            fromBaseId: baseId,
            spaceId,
            name: `${prefix}-copy`,
            withRecords: true,
          },
        );
        if (!isSuccess(duplicated) || !duplicated.data?.id) {
          throw new Error(
            `duplicating the base answered ${describeResponse(duplicated)}`,
          );
        }
        const tables = await rawRequest<{ id: string; name: string }[]>(
          "GET",
          `/base/${duplicated.data.id}/table`,
        );
        const copyParents = (tables.data ?? []).find(
          (table) => table.name === "Parents",
        );
        if (!copyParents) {
          throw new Error("the copy has no Parents table");
        }
        let copy = await readCounts(copyParents.id);
        for (
          let attempt = 0;
          attempt < config.settleAttempts &&
          JSON.stringify(copy) !== JSON.stringify(source);
          attempt++
        ) {
          await sleep(config.settleIntervalMs);
          copy = await readCounts(copyParents.id);
        }
        if (JSON.stringify(copy) !== JSON.stringify(source)) {
          throw new Error(
            `the copy counts ${JSON.stringify(copy)} where the original counts ${JSON.stringify(source)}`,
          );
        }
        return { counts: copy };
      },
    );
    return { details: { spaceId, ...probe } };
  } finally {
    if (spaceId) {
      try {
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
