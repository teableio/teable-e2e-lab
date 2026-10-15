import { FieldKeyType, FieldType } from "@teable/core";
import {
  DUPLICATE_TABLE,
  getRecords as apiGetRecords,
  urlBuilder,
} from "@teable/openapi";
import {
  createTable,
  deleteRecord,
  getRecords,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  DuplicateTableSystemFieldsCaseConfig,
} from "../types";
import {
  describeResponse,
  dropTables,
  isSuccess,
  rawRequest,
  sleep,
} from "./raw-api";

// A table with a row number, a created time and a last-changed pair, one row
// deleted from the middle -> duplicate it with its rows -> checkpoint: the copy
// holds every surviving row, numbered from 1 without the gap, created at the
// moment of copying, and with no change history until someone edits it.
//
// Copying a table is how people start next month's sheet from this month's.
// The columns the product fills in itself were copied as if somebody had
// typed them, and the database refuses a typed value for a row number - so
// the copy failed half way, leaving a table with the right columns and no
// rows. Nothing about an empty copy says "the copy failed".
//
// The deleted middle row is what makes the numbering observable: a copy that
// carried the old numbers over would read 1, 3, 4 instead of 1, 2, 3.

const NAME_FIELD = "Name";
const NUMBER_FIELD = "Number";
const CREATED_FIELD = "Created";
const MODIFIED_FIELD = "Modified";
const MODIFIER_FIELD = "Modified by";

export const runDuplicateTableSystemFieldsCase = async (
  bugCase: BugCaseFor<"duplicate-table-system-fields">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateTableSystemFieldsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];

  const survivors = config.rows.filter((row) => row !== config.deletedRow);
  if (survivors.length !== config.rows.length - 1 || survivors.length < 2) {
    throw new Error(
      "the deleted row has to be one of the rows, and at least two have to survive it",
    );
  }
  if (
    config.rows.indexOf(config.deletedRow) === 0 ||
    config.rows.indexOf(config.deletedRow) === config.rows.length - 1
  ) {
    throw new Error(
      "the deleted row has to sit in the middle, or the old numbers and the renumbered ones agree",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: NUMBER_FIELD, type: FieldType.AutoNumber },
        { name: CREATED_FIELD, type: FieldType.CreatedTime },
        { name: MODIFIED_FIELD, type: FieldType.LastModifiedTime },
        { name: MODIFIER_FIELD, type: FieldType.LastModifiedBy },
      ],
      records: config.rows.map((row) => ({
        fields: { [NAME_FIELD]: `${row}-draft` },
      })),
    });
    tableIds.push(table.id);
    const nameFieldId = table.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    )?.id;
    if (!nameFieldId) {
      throw new Error(`table ${table.id} has no ${NAME_FIELD} column`);
    }

    // Every row is edited once, so the source carries a change history the
    // copy must not inherit.
    const created = await getRecords(table.id, {
      fieldKeyType: FieldKeyType.Name,
    });
    for (const record of created.records) {
      const draft = String(record.fields[NAME_FIELD]);
      await updateRecordByApi(
        table.id,
        record.id,
        nameFieldId,
        draft.replace(/-draft$/, ""),
      );
    }
    const deleted = (
      await getRecords(table.id, { fieldKeyType: FieldKeyType.Name })
    ).records.find(
      (record: { fields: Record<string, unknown> }) =>
        record.fields[NAME_FIELD] === config.deletedRow,
    );
    if (!deleted) {
      throw new Error(`row ${config.deletedRow} did not land`);
    }
    await deleteRecord(table.id, deleted.id);

    const source = await getRecords(table.id, {
      fieldKeyType: FieldKeyType.Name,
    });
    const sourceNumbers = source.records.map(
      (record: { fields: Record<string, unknown> }) =>
        record.fields[NUMBER_FIELD],
    );
    const sourceCreated = source.records.map(
      (record: { fields: Record<string, unknown> }) =>
        String(record.fields[CREATED_FIELD]),
    );
    const expectedSourceNumbers = config.rows
      .map((row, index) => ({ row, number: index + 1 }))
      .filter(({ row }) => row !== config.deletedRow)
      .map(({ number }) => number);
    if (
      JSON.stringify(sourceNumbers) !== JSON.stringify(expectedSourceNumbers)
    ) {
      throw new Error(
        `the source numbers read ${JSON.stringify(sourceNumbers)}, expected ${JSON.stringify(expectedSourceNumbers)} - ` +
          "without the gap the case cannot tell a renumbered copy from a copied one",
      );
    }
    if (
      source.records.some(
        (record: { fields: Record<string, unknown> }) =>
          !record.fields[MODIFIED_FIELD] || !record.fields[MODIFIER_FIELD],
      )
    ) {
      throw new Error(
        "the source rows carry no change history, so the copy has nothing to leave behind",
      );
    }

    // The source rows have to be visibly older than the copy.
    await sleep(config.ageSourceMs);
    const copiedAt = Date.now();
    const duplicate = await rawRequest<{ id?: string }>(
      "POST",
      urlBuilder(DUPLICATE_TABLE, { baseId, tableId: table.id }),
      { name: `${suffix}-copy`, includeRecords: true },
    );
    const copyId = duplicate.data?.id;
    if (copyId) {
      tableIds.push(copyId);
    }

    const probe = await bugCheckpoint(
      "a-duplicated-table-keeps-its-rows-and-starts-its-own-history",
      async () => {
        if (!isSuccess(duplicate) || !copyId) {
          throw new Error(
            `duplicating the table with its rows answered ${describeResponse(duplicate)}`,
          );
        }
        const duplicateRouting = assertServedByV2(duplicate.headers, {
          operation: "POST /base/{baseId}/table/{tableId}/duplicate",
          feature: "duplicateTable",
        });

        const read = await apiGetRecords(copyId, {
          fieldKeyType: FieldKeyType.Name,
        });
        assertServedByV2(read.headers, {
          operation: "GET /table/{tableId}/record",
          feature: "getRecords",
        });
        const rows = read.data.records.map(
          (record: { fields: Record<string, unknown> }) => record.fields,
        );
        const names = rows.map(
          (fields: Record<string, unknown>) => fields[NAME_FIELD],
        );
        if (JSON.stringify(names) !== JSON.stringify(survivors)) {
          throw new Error(
            `the copy holds ${JSON.stringify(names)}, expected ${JSON.stringify(survivors)}` +
              (names.length === 0
                ? " - the columns were copied and the rows were not"
                : ""),
          );
        }
        const numbers = rows.map(
          (fields: Record<string, unknown>) => fields[NUMBER_FIELD],
        );
        const expectedNumbers = survivors.map((_, index) => index + 1);
        if (JSON.stringify(numbers) !== JSON.stringify(expectedNumbers)) {
          throw new Error(
            `the copy is numbered ${JSON.stringify(numbers)}, expected ${JSON.stringify(expectedNumbers)}`,
          );
        }
        for (const [index, fields] of rows.entries()) {
          const createdAt = Date.parse(String(fields[CREATED_FIELD]));
          if (
            !Number.isFinite(createdAt) ||
            createdAt < copiedAt - 1_000 ||
            String(fields[CREATED_FIELD]) === sourceCreated[index]
          ) {
            throw new Error(
              `copied row ${String(fields[NAME_FIELD])} was created ${String(fields[CREATED_FIELD])}, ` +
                `expected the moment of copying (${new Date(copiedAt).toISOString()}), not the source's ${sourceCreated[index]}`,
            );
          }
          if (
            fields[MODIFIED_FIELD] != null ||
            fields[MODIFIER_FIELD] != null
          ) {
            throw new Error(
              `copied row ${String(fields[NAME_FIELD])} already reads as changed ` +
                `(${JSON.stringify(fields[MODIFIED_FIELD])} by ${JSON.stringify(fields[MODIFIER_FIELD])}) - nobody has edited it`,
            );
          }
        }
        return { duplicateRouting, numbers };
      },
    );

    return {
      details: {
        sourceTableId: table.id,
        copyTableId: copyId,
        numbers: probe.numbers,
      },
    };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
