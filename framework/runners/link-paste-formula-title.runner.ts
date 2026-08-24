import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  PASTE_URL,
  urlBuilder,
} from "@teable/openapi";
import {
  convertField,
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkPasteFormulaTitleCaseConfig } from "../types";

// A table whose first column is worked out rather than typed, and a link
// pointing at it -> paste one of those worked-out names into the link column
// -> checkpoint: it finds the row.
//
// Plenty of tables name their rows by rule: an invoice number built from a
// prefix and a counter, a person's full name assembled from two columns, a
// code that combines a year and a sequence. That first column is what a link
// displays and what pasting into a link matches against.
//
// Matching was only allowed when the first column was plain typed text. A
// column that works its value out was refused - so pasting a list of invoice
// numbers into a link column, the most ordinary way to fill one in, failed
// outright on exactly the tables whose names are most predictable.
//
// The control is the same paste against a table whose first column is typed
// text, so a build where no paste resolves anything is told apart from this.

const NAME_FIELD = "Name";
const CODE_FIELD = "Code";
const LINK_FIELD = "Invoice";

export const runLinkPasteFormulaTitleCase = async (
  bugCase: BugCaseFor<"link-paste-formula-title">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkPasteFormulaTitleCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  try {
    // The foreign table: its first column is worked out from another one.
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: CODE_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.foreignRows.map((code) => ({
        fields: { [NAME_FIELD]: code, [CODE_FIELD]: code },
      })),
    });
    createdTableIds.unshift(foreign.id);
    const primaryFieldId = foreign.fields.find(
      (field: { isPrimary?: boolean }) => field.isPrimary,
    )?.id;
    const codeFieldId = foreign.fields.find(
      (field: { name: string }) => field.name === CODE_FIELD,
    )?.id;
    if (!primaryFieldId || !codeFieldId) {
      throw new Error(`Table ${foreign.id} is not in place`);
    }

    await convertField(foreign.id, primaryFieldId, {
      name: NAME_FIELD,
      type: FieldType.Formula,
      options: {
        expression: `CONCATENATE("${config.prefix}", {${codeFieldId}})`,
      },
    });

    const foreignRows = await apiGetRecords(foreign.id, {
      fieldKeyType: FieldKeyType.Name,
      take: config.foreignRows.length,
    });
    const titles = foreignRows.data.records.map(
      (record: { fields: Record<string, unknown> }) =>
        String(record.fields[NAME_FIELD] ?? ""),
    );
    const wanted = `${config.prefix}${config.foreignRows[0]}`;
    if (!titles.includes(wanted)) {
      throw new Error(
        `the foreign table's first column reads ${JSON.stringify(titles)}, expected one of them to be ` +
          `${JSON.stringify(wanted)} - the fixture is not in place`,
      );
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowTitle } }],
    });
    createdTableIds.unshift(host.id);
    const viewId = host.views?.[0]?.id;
    if (!viewId) {
      throw new Error(`Table ${host.id} has no view`);
    }

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });
    const linkColumnIndex = [...host.fields, linkField].findIndex(
      (field: { id: string }) => field.id === linkField.id,
    );

    const probe = await bugCheckpoint(
      "pasting-a-worked-out-name-into-a-link-finds-the-row",
      async () => {
        const response = await axios.patch(
          urlBuilder(PASTE_URL, { tableId: host.id }),
          {
            viewId,
            ranges: [
              [linkColumnIndex, 0],
              [linkColumnIndex, 0],
            ],
            // Text, the way a pasted column of invoice numbers arrives.
            content: wanted,
            header: [linkField],
          },
          { validateStatus: () => true },
        );
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            `pasting ${JSON.stringify(wanted)} into the link column answered ${response.status}: ` +
              `${JSON.stringify(response.data)}`,
          );
        }

        const after = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Name,
          take: 1,
        });
        const cell = after.data.records[0]?.fields[LINK_FIELD] as
          | { title?: unknown }
          | undefined;
        if (!cell) {
          throw new Error(
            `the paste answered ${response.status} but the link cell is empty - the name was not matched to ` +
              "any row",
          );
        }
        if (cell.title !== wanted) {
          throw new Error(
            `the link cell holds ${JSON.stringify(cell)}, expected the row called ${JSON.stringify(wanted)}`,
          );
        }
        return { status: response.status, cell };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignTableId: foreign.id,
        pasted: wanted,
        linkCell: probe.cell,
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
