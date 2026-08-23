import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  CONVERT_FIELD,
  CREATE_RECORD,
  urlBuilder,
} from "@teable/openapi";
import {
  createRecords,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { UniqueToggleCleanupCaseConfig } from "../types";

// A column that refuses duplicates, told to stop refusing them -> checkpoint:
// a duplicate goes in.
//
// "No duplicates" is a switch, and switches go both ways. Turning it on builds
// something in the database to enforce it; turning it off has to take that
// away, and it did not. What is left is a column whose settings say duplicates
// are fine and whose behaviour says they are not - refused with a message
// about a constraint nobody can find in the interface.
//
// The observation is the second write rather than the field's settings. The
// settings were always right; it is the row that would not go in.

const NAME_FIELD = "Name";
const CODE_FIELD = "Code";

export const runUniqueToggleCleanupCase = async (
  bugCase: BugCaseFor<"unique-toggle-cleanup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: UniqueToggleCleanupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: CODE_FIELD,
          type: FieldType.SingleLineText,
          unique: true,
        },
      ],
      records: [],
    });
    tableId = table.id;
    const codeField = table.fields.find(
      (field: { name: string }) => field.name === CODE_FIELD,
    );
    if (!codeField?.id) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    await createRecords(tableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        { fields: { [NAME_FIELD]: "first", [CODE_FIELD]: config.code } },
      ],
    });

    // Fixture verification, outside the checkpoint: the constraint is really
    // in force before it is switched off. A column that never refused a
    // duplicate would accept one afterwards for reasons of its own.
    const whileUnique = await axios.post(
      urlBuilder(CREATE_RECORD, { tableId }),
      {
        fieldKeyType: FieldKeyType.Name,
        typecast: false,
        records: [
          { fields: { [NAME_FIELD]: "rejected", [CODE_FIELD]: config.code } },
        ],
      },
      { validateStatus: () => true },
    );
    if (whileUnique.status >= 200 && whileUnique.status < 300) {
      throw new Error(
        "a duplicate went in while the column still refuses duplicates - the fixture is not in place",
      );
    }

    // The switch, off.
    const converted = await axios.put(
      urlBuilder(CONVERT_FIELD, { tableId, fieldId: codeField.id }),
      {
        name: CODE_FIELD,
        type: FieldType.SingleLineText,
        unique: false,
      },
      { validateStatus: () => true },
    );
    if (converted.status < 200 || converted.status >= 300) {
      throw new Error(
        `switching duplicates back on answered ${converted.status}: ` +
          `${JSON.stringify(converted.data ?? "")}`,
      );
    }
    const afterToggle = await getFields(tableId);
    const settings = afterToggle.find(
      (field: { id: string }) => field.id === codeField.id,
    );
    if (settings?.unique) {
      throw new Error(
        "the column still says it refuses duplicates after the switch was turned off - " +
          "the case is about behaviour disagreeing with the settings, and here they agree",
      );
    }

    const probe = await bugCheckpoint(
      "a-column-that-stopped-refusing-duplicates-accepts-one",
      async () => {
        const response = await axios.post(
          urlBuilder(CREATE_RECORD, { tableId }),
          {
            fieldKeyType: FieldKeyType.Name,
            typecast: false,
            records: [
              { fields: { [NAME_FIELD]: "second", [CODE_FIELD]: config.code } },
            ],
          },
          { validateStatus: () => true },
        );
        const status = response.status;
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data ?? "");
        if (status < 200 || status >= 300) {
          throw new Error(
            `the column says duplicates are allowed, and writing one answered ${status}: ${body}`,
          );
        }
        return { status, routing: pickRoutingHeaders(response.headers) };
      },
    );

    return {
      details: {
        tableId,
        rejectedWhileUnique: whileUnique.status,
        acceptedAfterToggle: probe.status,
        routing: probe.routing,
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
