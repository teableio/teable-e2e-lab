import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  DuplicateReverseLinkFieldCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// Children each pointing at one parent, which gives parents the reverse
// "children" column -> duplicate that reverse column -> checkpoint: the copy
// lists the same children per parent, and editing the copy leaves the
// original column and the children's own links as they were.
//
// Duplicating a link column copies how it is stored as well as what it shows.
// For the reverse side of a many-to-one link the copy reused the original's
// storage or none at all: it came out empty, or editing it rewired the real
// relationship underneath the original column.

const NAME = "Name";

type Row = { id: string; fields: Record<string, unknown> };
const ids = (value: unknown) =>
  ((Array.isArray(value) ? value : value ? [value] : []) as { id: string }[])
    .map((cell) => cell.id)
    .sort();

export const runDuplicateReverseLinkFieldCase = async (
  bugCase: BugCaseFor<"duplicate-reverse-link-field">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateReverseLinkFieldCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const name = (part: string) =>
    `${config.tableNamePrefix}-${part}-${context.runId}`;

  try {
    const parents = await createTable(baseId, {
      name: name("parents"),
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: [{ fields: { [NAME]: "p1" } }, { fields: { [NAME]: "p2" } }],
    });
    tableIds.push(parents.id);
    const children = await createTable(baseId, {
      name: name("children"),
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: ["c1", "c2", "c3", "c4"].map((child) => ({
        fields: { [NAME]: child },
      })),
    });
    tableIds.push(children.id);
    const toParent = await createField(children.id, {
      name: "Parent",
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: parents.id,
      },
    });
    const reverseId = (toParent.options as { symmetricFieldId: string })
      .symmetricFieldId;
    // c1, c2 -> p1; c3 -> p2; c4 unlinked.
    for (const [index, parent] of [0, 0, 1].entries()) {
      await rawRequest(
        "PATCH",
        `/table/${children.id}/record/${children.records[index].id}`,
        {
          fieldKeyType: FieldKeyType.Id,
          record: {
            fields: { [toParent.id]: { id: parents.records[parent].id } },
          },
        },
      );
    }
    const readRows = async (tableId: string) =>
      (
        await rawRequest<{ records: Row[] }>(
          "GET",
          `/table/${tableId}/record?fieldKeyType=${FieldKeyType.Id}`,
        )
      ).data.records ?? [];
    const childLinksBefore = (await readRows(children.id)).map((row) =>
      ids(row.fields[toParent.id]),
    );

    const probe = await bugCheckpoint(
      "a-duplicated-reverse-link-is-independent-and-complete",
      async () => {
        const duplicated = await rawRequest<{ id?: string }>(
          "POST",
          `/table/${parents.id}/field/${reverseId}/duplicate`,
          { name: "Children copy" },
        );
        if (!isSuccess(duplicated) || !duplicated.data?.id) {
          throw new Error(
            `duplicating the reverse link answered ${describeResponse(duplicated)}`,
          );
        }
        const copyId = duplicated.data.id;
        const problems: string[] = [];
        for (const row of await readRows(parents.id)) {
          const original = ids(row.fields[reverseId]);
          const copy = ids(row.fields[copyId]);
          if (JSON.stringify(original) !== JSON.stringify(copy)) {
            problems.push(
              `${row.fields[parents.fields[0].id]}: copy lists ${copy.length} children, original ${original.length}`,
            );
          }
        }
        // Editing the copy must not move the real relationship.
        const p2 = parents.records[1].id;
        await rawRequest("PATCH", `/table/${parents.id}/record/${p2}`, {
          fieldKeyType: FieldKeyType.Id,
          record: { fields: { [copyId]: [{ id: children.records[3].id }] } },
        });
        const childLinksAfter = (await readRows(children.id)).map((row) =>
          ids(row.fields[toParent.id]),
        );
        if (
          JSON.stringify(childLinksAfter) !== JSON.stringify(childLinksBefore)
        ) {
          problems.push(
            "editing the copy changed which parent each child points at",
          );
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { copyId };
      },
    );
    return { details: { parentsTableId: parents.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
