import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  CREATE_RECORD,
  CREATE_FIELD,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2, pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RequiredDefaultCaseConfig } from "../types";

// A required column with a default value -> checkpoint: the default satisfies
// the requirement.
//
// "Required" and "has a default" belong together: the default is the answer
// for everyone who does not supply one. Marking a column required and giving
// it a default is how a table says "this always has a value, and here is the
// usual one".
//
// The order was wrong in two places, and each rejects a perfectly ordinary
// request:
//
//   onCreate (T5686): a record created without that column was refused for
//     being empty, before the default had been applied. The default was never
//     going to leave it empty.
//   onAddField (T5685): the same column added to a table that already has
//     rows was refused for the same reason - the existing rows were checked
//     against the constraint before the default was written into them.
//
// Both are the request being refused, so both run inside the checkpoint and
// through raw axios: the generated client throws on a non-2xx and drops the
// response, and the response is the evidence.

const NAME_FIELD = "Name";
const REQUIRED_FIELD = "Owner Note";
const ROW_TITLE = "the-row";

export const runRequiredDefaultCase = async (
  bugCase: BugCaseFor<"required-default">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RequiredDefaultCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const requiredFieldRo = {
    name: REQUIRED_FIELD,
    type: FieldType.SingleLineText,
    notNull: true,
    options: { defaultValue: config.defaultValue },
  };

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        // The create-a-record shape needs the column in place first; the
        // add-a-field shape is the column arriving later.
        ...(config.moment === "onCreate" ? [requiredFieldRo] : []),
      ],
      records:
        config.moment === "onAddField"
          ? [{ fields: { [NAME_FIELD]: ROW_TITLE } }]
          : [],
    });
    tableId = table.id;

    const readRows = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 5,
      });
      return {
        headers: response.headers,
        rows: response.data.records.map(
          (record: { fields: Record<string, unknown> }) => ({
            name: String(record.fields[NAME_FIELD] ?? ""),
            value: String(record.fields[REQUIRED_FIELD] ?? ""),
          }),
        ),
      };
    };

    // Fixture verification, outside the checkpoint: for the add-a-field shape
    // the table has to already hold a row, because the rows that are already
    // there are what the constraint is checked against.
    const before = await readRows();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (config.moment === "onAddField" && before.rows.length !== 1) {
      throw new Error(
        `the table holds ${before.rows.length} rows before the column is added, expected 1 - the fixture ` +
          "is not in place",
      );
    }

    const probe = await bugCheckpoint(
      "a-default-satisfies-a-required-column",
      async () => {
        // Raw axios with the status open: this is the request that is refused
        // before the fix.
        const response =
          config.moment === "onCreate"
            ? await axios.post(
                urlBuilder(CREATE_RECORD, { tableId }),
                {
                  fieldKeyType: FieldKeyType.Name,
                  typecast: false,
                  records: [{ fields: { [NAME_FIELD]: ROW_TITLE } }],
                },
                { validateStatus: () => true },
              )
            : await axios.post(
                urlBuilder(CREATE_FIELD, { tableId }),
                requiredFieldRo,
                { validateStatus: () => true },
              );
        const status = response.status;
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data ?? "");
        if (status < 200 || status >= 300) {
          throw new Error(
            `${
              config.moment === "onCreate"
                ? "creating a record without the required column"
                : "adding a required column with a default to a table that has rows"
            } answered ${status}: ${body}`,
          );
        }

        // And the value is the default. A request that succeeded while leaving
        // the cell empty would be the same column without its promise.
        const after = await readRows();
        const wrong = after.rows.filter(
          (row) => row.value !== config.defaultValue,
        );
        if (after.rows.length === 0 || wrong.length > 0) {
          throw new Error(
            `the rows read ${JSON.stringify(after.rows)}, expected every one to hold the default ` +
              `${JSON.stringify(config.defaultValue)}`,
          );
        }
        return {
          status,
          routing: pickRoutingHeaders(response.headers),
          rows: after.rows,
        };
      },
    );

    return {
      details: {
        tableId,
        moment: config.moment,
        routing,
        requestRouting: probe.routing,
        status: probe.status,
        rows: probe.rows,
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
