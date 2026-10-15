import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { PASTE_BY_ID_URL, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  getRecord,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  LinkPasteAutocreateCaseConfig,
} from "../types";
import { describeResponse, dropTables, rawRequest } from "./raw-api";

// Pasting a name that matches no row into a link cell asks the product to
// create that row on the far side. It can only do that by writing the name
// into the far table's primary column - so when that is impossible, the paste
// has to be refused with a reason the person can act on, and nothing may be
// written on either side. One scenario per way it is impossible:
//
//   - non-primary-title: the link shows a column other than the primary one.
//     The paste reported success and did nothing, so the person saw "pasted"
//     and an empty cell.
//   - computed-primary: the far table's primary column is a row number the
//     product fills in. The paste was refused, but as a generic validation
//     failure about resolving a title, which names no column the person can
//     change and no reason they can act on.
//
// The checkpoint pins the refusal's own code, the far table's row count and
// the link cell, so a paste that half-ran is caught as well as a wrong reason.

const NAME_FIELD = "Name";
const CODE_FIELD = "Code";
const NUMBER_FIELD = "Number";
const LINK_FIELD = "Target";

export const runLinkPasteAutocreateCase = async (
  bugCase: BugCaseFor<"link-paste-autocreate">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkPasteAutocreateCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const target =
      config.scenario === "computed-primary"
        ? await createTable(baseId, {
            name: `${config.tableNamePrefix}-target-${context.runId}`,
            fields: [
              {
                name: NUMBER_FIELD,
                type: FieldType.AutoNumber,
                isPrimary: true,
              },
              { name: NAME_FIELD, type: FieldType.SingleLineText },
            ],
            records: config.targetNames.map((name) => ({
              fields: { [NAME_FIELD]: name },
            })),
          })
        : await createTable(baseId, {
            name: `${config.tableNamePrefix}-target-${context.runId}`,
            fields: [
              {
                name: NAME_FIELD,
                type: FieldType.SingleLineText,
                isPrimary: true,
              },
              { name: CODE_FIELD, type: FieldType.SingleLineText },
            ],
            records: config.targetNames.map((name, index) => ({
              fields: { [NAME_FIELD]: name, [CODE_FIELD]: `code-${index + 1}` },
            })),
          });
    tableIds.push(target.id);
    const host = await createTable(baseId, {
      name: `${config.tableNamePrefix}-host-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "row" } }],
    });
    tableIds.push(host.id);

    const codeId = target.fields.find(
      (field: { name: string }) => field.name === CODE_FIELD,
    )?.id;
    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options:
        config.scenario === "non-primary-title"
          ? {
              relationship: Relationship.ManyOne,
              foreignTableId: target.id,
              lookupFieldId: codeId,
            }
          : {
              relationship: Relationship.ManyMany,
              foreignTableId: target.id,
            },
    });
    const hostRecordId = host.records[0].id;
    const targetCountBefore = (await getRecords(target.id)).records.length;
    if (targetCountBefore !== config.targetNames.length) {
      throw new Error(
        `the far table holds ${targetCountBefore} rows, expected ${config.targetNames.length}`,
      );
    }

    const probe = await bugCheckpoint(
      "a-paste-that-cannot-create-the-row-is-refused-for-the-right-reason",
      async () => {
        const pasted = await rawRequest<{ data?: { domainCode?: string } }>(
          "PATCH",
          urlBuilder(PASTE_BY_ID_URL, { tableId: host.id }),
          {
            viewId: host.views[0].id,
            selection: { recordIds: [hostRecordId], fieldIds: [link.id] },
            content: [[config.pastedName]],
          },
        );
        const routing = assertServedByV2(pasted.headers, {
          operation: "PATCH /table/{tableId}/selection/paste-by-id",
          feature: "paste",
        });
        const targetCountAfter = (await getRecords(target.id)).records.length;
        const cell =
          (await getRecord(host.id, hostRecordId)).fields[link.id] ?? null;
        const problems: string[] = [];
        if (pasted.status !== 400) {
          problems.push(
            `the paste answered ${describeResponse(pasted)}, expected a 400 refusal`,
          );
        } else if (pasted.data?.data?.domainCode !== config.expectedCode) {
          problems.push(
            `the paste was refused with ${JSON.stringify(pasted.data?.data?.domainCode)}, expected ${config.expectedCode}: ${describeResponse(pasted)}`,
          );
        }
        if (targetCountAfter !== targetCountBefore) {
          problems.push(
            `the far table went from ${targetCountBefore} to ${targetCountAfter} rows`,
          );
        }
        if (cell !== null) {
          problems.push(`the link cell now reads ${JSON.stringify(cell)}`);
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { routing, code: pasted.data?.data?.domainCode };
      },
    );

    return { details: { hostTableId: host.id, code: probe.code } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
