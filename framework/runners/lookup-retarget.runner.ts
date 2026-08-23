import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  Relationship,
  TimeFormatting,
} from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupRetargetCaseConfig } from "../types";

// A lookup pointing at a date column, repointed at a text column ->
// checkpoint: it shows the text.
//
// Pointing a lookup somewhere else is an ordinary edit - the column it was
// following turned out to be the wrong one. The two columns are stored
// differently underneath, and the lookup's own storage was left as it was, so
// what came back afterwards was not the text it now points at.
//
// The values are what a person sees, so they are what the case asserts: the
// column has to read the new target's value, not the old one and not nothing.

const NAME_FIELD = "Name";
const DATE_FIELD = "When";
const TEXT_FIELD = "Note";
const LINK_FIELD = "Source";
const LOOKUP_FIELD = "Looked Up";
const HOST_ROW = "the-row";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runLookupRetargetCase = async (
  bugCase: BugCaseFor<"lookup-retarget">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupRetargetCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let foreignTableId = "";
  let hostTableId = "";

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: "UTC",
            },
          },
        },
        { name: TEXT_FIELD, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: "source-row",
            [DATE_FIELD]: config.dateValue,
            [TEXT_FIELD]: config.textValue,
          },
        },
      ],
    });
    foreignTableId = foreignTable.id;
    const dateFieldId = foreignTable.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    )?.id;
    const textFieldId = foreignTable.fields.find(
      (field: { name: string }) => field.name === TEXT_FIELD,
    )?.id;
    const foreignRecordId = foreignTable.records[0]?.id;
    if (!dateFieldId || !textFieldId || !foreignRecordId) {
      throw new Error(`Source table ${foreignTableId} is not in place`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    hostTableId = hostTable.id;
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.ManyOne,
      },
    });
    const lookupField = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.Date,
      isLookup: true,
      lookupOptions: {
        foreignTableId,
        lookupFieldId: dateFieldId,
        linkFieldId: linkField.id,
      },
    });
    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [NAME_FIELD]: HOST_ROW,
            [LINK_FIELD]: { id: foreignRecordId },
          },
        },
      ],
    });

    const readLookup = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 1,
      });
      const cell = response.data.records[0]?.fields[LOOKUP_FIELD];
      return {
        headers: response.headers,
        value: Array.isArray(cell)
          ? cell.map(String).join(",")
          : String(cell ?? ""),
      };
    };

    // Fixture verification, outside the checkpoint: the lookup followed the
    // date column before it was repointed. A column that never resolved would
    // make "it does not show the new target" describe something else.
    const settleDate = async () => {
      const deadline = Date.now() + config.settleTimeoutMs;
      let seen = "";
      for (;;) {
        const current = await readLookup();
        seen = current.value;
        if (seen.startsWith(config.dateValue.slice(0, 10))) {
          return current;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `the lookup reads ${JSON.stringify(seen)} before the change, expected the date ` +
              `${JSON.stringify(config.dateValue)} - the fixture is not in place`,
          );
        }
        await sleep(config.pollIntervalMs);
      }
    };
    const seeded = await settleDate();
    const routing = assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "repointed-lookup-shows-its-new-target",
      async () => {
        const updated = await convertField(hostTableId, lookupField.id, {
          name: LOOKUP_FIELD,
          type: FieldType.SingleLineText,
          isLookup: true,
          lookupOptions: {
            foreignTableId,
            lookupFieldId: textFieldId,
            linkFieldId: linkField.id,
          },
        });
        if (updated.lookupOptions?.lookupFieldId !== textFieldId) {
          throw new Error(
            `the column still points at ${JSON.stringify(updated.lookupOptions?.lookupFieldId)}, expected the ` +
              `text column ${textFieldId}`,
          );
        }

        const deadline = Date.now() + config.settleTimeoutMs;
        let seen = "";
        for (;;) {
          seen = (await readLookup()).value;
          if (seen === config.textValue) {
            return { value: seen };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.pollIntervalMs);
        }
        throw new Error(
          `after ${config.settleTimeoutMs}ms the repointed column reads ${JSON.stringify(seen)}, expected ` +
            `${JSON.stringify(config.textValue)} - it is still stored the way the date column needed`,
        );
      },
    );

    return {
      details: {
        foreignTableId,
        hostTableId,
        routing,
        valueAfterRetarget: probe.value,
      },
    };
  } finally {
    for (const tableId of [hostTableId, foreignTableId]) {
      if (!tableId) {
        continue;
      }
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
