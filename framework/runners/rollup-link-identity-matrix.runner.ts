import { FieldKeyType, FieldType, Relationship } from "@teable/core";
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

const relationships = [
  { key: "oo", relationship: Relationship.OneOne },
  { key: "om", relationship: Relationship.OneMany },
  { key: "mo", relationship: Relationship.ManyOne },
  { key: "mm", relationship: Relationship.ManyMany },
] as const;

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));

const textValues = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object" && "title" in item) {
      return String((item as { title?: unknown }).title ?? "");
    }
    return String(item);
  });
};

export const runRollupLinkIdentityMatrixCase = async (
  bugCase: BugCaseFor<"rollup-link-identity-matrix">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];

  if (config.coveredCaseIds.join(",") !== "Y465") {
    throw new Error("the case-id matrix no longer matches Y465");
  }

  try {
    const target = await createTable(baseId, {
      name: `${suffix}-target`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.unshift(target.id);

    const child = await createTable(baseId, {
      name: `${suffix}-child`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.unshift(child.id);

    const parent = await createTable(baseId, {
      name: `${suffix}-parent`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.unshift(parent.id);

    const children = await createField(parent.id, {
      name: "Children",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: child.id,
      },
    });

    const childLinks = new Map<string, string>();
    const uniqueRollups = new Map<string, string>();
    for (const item of relationships) {
      const link = await createField(child.id, {
        name: `Targets ${item.key}`,
        type: FieldType.Link,
        options: {
          relationship: item.relationship,
          foreignTableId: target.id,
        },
      });
      childLinks.set(item.key, link.id);

      const rollup = await createField(parent.id, {
        name: `Unique ${item.key}`,
        type: FieldType.Rollup,
        options: { expression: "array_unique({values})" },
        lookupOptions: {
          foreignTableId: child.id,
          linkFieldId: children.id,
          lookupFieldId: link.id,
        },
      });
      uniqueRollups.set(item.key, rollup.id);
    }

    const compactRollup = await createField(parent.id, {
      name: "Compact mm",
      type: FieldType.Rollup,
      options: { expression: "array_compact({values})" },
      lookupOptions: {
        foreignTableId: child.id,
        linkFieldId: children.id,
        lookupFieldId: childLinks.get("mm")!,
      },
    });

    const madeTargets = await apiCreateRecords(target.id, {
      fieldKeyType: FieldKeyType.Name,
      records: ["Shared", "Same", "Same", "Extra", "Outside"].map((name) => ({
        fields: { Name: name },
      })),
    });
    const [shared, sameA, sameB, extra, outside] = madeTargets.data.records;
    if (!shared || !sameA || !sameB || !extra || !outside) {
      throw new Error("the target fixture is incomplete");
    }

    const childFields = (name: string, second: boolean) => ({
      [child.fields[0].id]: name,
      [childLinks.get("oo")!]: { id: second ? sameB.id : sameA.id },
      [childLinks.get("om")!]: second
        ? [{ id: sameB.id }, { id: extra.id }]
        : [{ id: shared.id }, { id: sameA.id }],
      [childLinks.get("mo")!]: { id: second ? sameB.id : sameA.id },
      [childLinks.get("mm")!]: second
        ? [{ id: shared.id }, { id: sameB.id }, { id: extra.id }]
        : [{ id: shared.id }, { id: sameA.id }],
    });
    const madeChildren = await apiCreateRecords(child.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        { fields: childFields("child-a", false) },
        { fields: childFields("child-b", true) },
        {
          fields: {
            [child.fields[0].id]: "unlinked-child",
            [childLinks.get("mm")!]: [{ id: outside.id }],
          },
        },
      ],
    });
    const [childA, childB] = madeChildren.data.records;
    if (!childA || !childB) throw new Error("the child fixture is incomplete");

    const madeParents = await apiCreateRecords(parent.id, {
      fieldKeyType: FieldKeyType.Id,
      records: [
        { fields: { [parent.fields[0].id]: "linked-parent" } },
        { fields: { [parent.fields[0].id]: "empty-parent" } },
      ],
    });
    const [linkedParent, emptyParent] = madeParents.data.records;
    if (!linkedParent || !emptyParent) {
      throw new Error("the parent fixture is incomplete");
    }
    await apiUpdateRecord(parent.id, linkedParent.id, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: { [children.id]: [{ id: childA.id }, { id: childB.id }] },
      },
    });

    const fixtureRead = await apiGetRecords(parent.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const routing = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const linkedCell = fixtureRead.data.records.find(
      (record: { id: string }) => record.id === linkedParent.id,
    )?.fields[children.id];
    if (!Array.isArray(linkedCell) || linkedCell.length !== 2) {
      throw new Error(
        `the linked parent reaches ${JSON.stringify(linkedCell)}, expected two child rows`,
      );
    }

    const expectedByRelationship: Record<string, string[]> = {
      oo: ["Same", "Same"],
      om: ["Shared", "Same", "Same", "Extra"],
      mo: ["Same", "Same"],
      mm: ["Shared", "Same", "Same", "Extra"],
    };
    const expectedCompact = ["Shared", "Same", "Shared", "Same", "Extra"];

    const probe = await bugCheckpoint(
      "ordinary-rollups-keep-linked-record-identity",
      async () => {
        let linkedFields: Record<string, unknown> = {};
        let emptyFields: Record<string, unknown> = {};
        const deadline = Date.now() + config.settleTimeoutMs;
        for (;;) {
          const read = await apiGetRecords(parent.id, {
            fieldKeyType: FieldKeyType.Id,
            take: 5,
          });
          linkedFields =
            read.data.records.find(
              (record: { id: string }) => record.id === linkedParent.id,
            )?.fields ?? {};
          emptyFields =
            read.data.records.find(
              (record: { id: string }) => record.id === emptyParent.id,
            )?.fields ?? {};
          const settled = relationships.every((item) => {
            const fieldId = uniqueRollups.get(item.key)!;
            return (
              textValues(linkedFields[fieldId]).join("\u0000") ===
              expectedByRelationship[item.key].join("\u0000")
            );
          });
          if (
            settled &&
            Array.isArray(linkedFields[compactRollup.id]) &&
            (linkedFields[compactRollup.id] as unknown[]).every(
              (item) => typeof item === "string",
            ) &&
            textValues(linkedFields[compactRollup.id]).join("\u0000") ===
              expectedCompact.join("\u0000")
          ) {
            break;
          }
          if (Date.now() >= deadline) break;
          await sleep(config.pollIntervalMs);
        }

        for (const item of relationships) {
          const fieldId = uniqueRollups.get(item.key)!;
          const actual = textValues(linkedFields[fieldId]);
          const expected = expectedByRelationship[item.key];
          if (actual.join("\u0000") !== expected.join("\u0000")) {
            throw new Error(
              `${item.key} unique rollup reads ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
            );
          }
          if (textValues(emptyFields[fieldId]).length !== 0) {
            throw new Error(
              `the empty parent has a ${item.key} rollup value: ${JSON.stringify(emptyFields[fieldId])}`,
            );
          }
        }
        const compact = textValues(linkedFields[compactRollup.id]);
        const compactRaw = linkedFields[compactRollup.id];
        if (
          !Array.isArray(compactRaw) ||
          compactRaw.some((item) => typeof item !== "string")
        ) {
          throw new Error(
            `the compact rollup returns ${JSON.stringify(compactRaw)}, expected title strings`,
          );
        }
        if (compact.join("\u0000") !== expectedCompact.join("\u0000")) {
          throw new Error(
            `the compact rollup reads ${JSON.stringify(compact)}, expected ${JSON.stringify(expectedCompact)}`,
          );
        }
        if (compact.includes("Outside")) {
          throw new Error("an unlinked child contributed to the parent rollup");
        }
        return { linkedFields, emptyFields };
      },
    );

    return {
      details: {
        parentTableId: parent.id,
        childTableId: child.id,
        targetTableId: target.id,
        routing,
        linkedFields: probe.linkedFields,
        emptyFields: probe.emptyFields,
      },
    };
  } finally {
    for (const tableId of tableIds) {
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
    }
  }
};
