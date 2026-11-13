import { FieldType, Relationship } from "@teable/core";
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
  LinkedFilterInvalidOperatorCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A host table linked to children holding a checkbox -> a counting rollup
// whose filter says "checkbox is not checked", which a checkbox cannot
// evaluate -> checkpoint: the field API refuses it with a 4xx and no such
// field exists afterwards.
//
// The filter was accepted and saved, and only failed later while the column
// was being filled in the background: the column showed nothing, the failure
// ended in a dead letter, and the person who saved it was told nothing. A
// control rollup with a filter the checkbox does support must still be
// accepted and count the checked child, so a fix that refused every filter
// would not pass.

const NAME = "Name";

export const runLinkedFilterInvalidOperatorCase = async (
  bugCase: BugCaseFor<"linked-filter-invalid-operator">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkedFilterInvalidOperatorCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const name = (part: string) =>
    `${config.tableNamePrefix}-${part}-${context.runId}`;

  try {
    const children = await createTable(baseId, {
      name: name("children"),
      fields: [
        { name: NAME, type: FieldType.SingleLineText, isPrimary: true },
        { name: "Flag", type: FieldType.Checkbox },
        { name: "Note", type: FieldType.SingleLineText },
      ],
      records: [
        { fields: { [NAME]: "checked", Flag: true, Note: "a" } },
        { fields: { [NAME]: "unchecked", Note: "b" } },
      ],
    });
    tableIds.push(children.id);
    const host = await createTable(baseId, {
      name: name("host"),
      fields: [{ name: NAME, type: FieldType.SingleLineText, isPrimary: true }],
      records: [{ fields: { [NAME]: "host" } }],
    });
    tableIds.push(host.id);
    const link = await createField(host.id, {
      name: "Children",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: children.id,
      },
    });
    await rawRequest(
      "PATCH",
      `/table/${host.id}/record/${host.records[0].id}`,
      {
        fieldKeyType: "id",
        record: {
          fields: {
            [link.id]: children.records.map((record: { id: string }) => ({
              id: record.id,
            })),
          },
        },
      },
    );
    const flagId = children.fields[1].id;
    const noteId = children.fields[2].id;
    const rollup = (fieldName: string, operator: string, value: unknown) =>
      rawRequest<{ id?: string }>("POST", `/table/${host.id}/field`, {
        name: fieldName,
        type: FieldType.Rollup,
        options: { expression: "countall({values})" },
        lookupOptions: {
          foreignTableId: children.id,
          linkFieldId: link.id,
          lookupFieldId: noteId,
          filter: {
            conjunction: "and",
            filterSet: [{ fieldId: flagId, operator, value }],
          },
        },
      });

    const control = await rollup("Checked count", "is", true);
    if (!isSuccess(control)) {
      throw new Error(
        `a checkbox "is checked" filter was refused: ${describeResponse(control)}`,
      );
    }

    const probe = await bugCheckpoint(
      "an-unevaluable-linked-filter-is-refused-when-saved",
      async () => {
        const refused = await rollup(
          "Not checked count",
          config.invalidOperator,
          true,
        );
        const fields = await rawRequest<{ name: string }[]>(
          "GET",
          `/table/${host.id}/field`,
        );
        const saved = (fields.data ?? []).some(
          (field) => field.name === "Not checked count",
        );
        if (refused.status < 400 || refused.status >= 500 || saved) {
          throw new Error(
            `a rollup filtered by checkbox ${config.invalidOperator} checked answered ${describeResponse(refused)}` +
              (saved ? " and the field was saved" : "") +
              ", expected a 4xx refusal and no field",
          );
        }
        return { status: refused.status };
      },
    );
    return { details: { hostTableId: host.id, ...probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
