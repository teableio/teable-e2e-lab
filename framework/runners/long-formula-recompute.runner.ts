import { FieldKeyType, FieldType } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  LongFormulaRecomputeCaseConfig,
} from "../types";
import { describeResponse, isSuccess, rawRequest, sleep } from "./raw-api";

// One text column and a formula over it built from many small terms, all
// reading that one column -> create a row and change a row -> checkpoint: both
// writes are accepted and the formula reads the right value afterwards.
//
// Each term becomes its own step in the statement that recomputes the formula.
// A budget meant for statements that recompute several formulas at once was
// applied to this single formula when a row was written, so the column could be
// created and filled but every later write that touched it was refused.

const NAME_FIELD = "Name";
const FORMULA_FIELD = "Encoded";

// Teable functions take a bounded number of arguments, so the terms are nested
// in groups rather than passed to one call.
const buildExpression = (nameId: string, groups: number[]) => {
  let index = 0;
  const parts = groups.map((size) => {
    const terms = Array.from({ length: size }, () => {
      const term = `ENCODE_URL_COMPONENT({${nameId}} & "${index}")`;
      index += 1;
      return term;
    });
    return `CONCATENATE(${terms.join(", ")})`;
  });
  return { expression: `CONCATENATE(${parts.join(", ")})`, termCount: index };
};

const expectedFor = (value: string, termCount: number) =>
  Array.from({ length: termCount }, (_, index) =>
    encodeURIComponent(`${value}${index}`),
  ).join("");

export const runLongFormulaRecomputeCase = async (
  bugCase: BugCaseFor<"long-formula-recompute">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LongFormulaRecomputeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const createdTableIds: string[] = [];

  if (config.groups.some((size) => size > 90)) {
    throw new Error(
      "each group must stay well under the argument limit of one call",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.initialValue } }],
    });
    createdTableIds.push(table.id);
    const nameId = table.fields[0].id as string;
    const firstId = table.records[0].id as string;
    const { expression, termCount } = buildExpression(nameId, config.groups);

    // Fixture verification: the table is served by v2.
    const before = await rawRequest(
      "GET",
      `/table/${table.id}/record?fieldKeyType=id&take=1`,
    );
    if (!isSuccess(before)) {
      throw new Error(`reading the table answered ${describeResponse(before)}`);
    }
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const readUntil = async (
      fieldId: string,
      recordId: string,
      expected: string,
    ) => {
      const deadline = Date.now() + config.settleTimeoutMs;
      for (;;) {
        const record = await rawRequest<{ fields?: Record<string, unknown> }>(
          "GET",
          `/table/${table.id}/record/${recordId}?fieldKeyType=id`,
        );
        if (!isSuccess(record)) {
          throw new Error(`reading a row answered ${describeResponse(record)}`);
        }
        const value = record.data.fields?.[fieldId];
        if (value === expected || Date.now() > deadline) {
          return value;
        }
        await sleep(config.settlePollIntervalMs);
      }
    };

    const probe = await bugCheckpoint(
      "a-long-single-column-formula-is-made-and-recomputes-on-write",
      async () => {
        // Made here: a revision with the bug may refuse the column itself,
        // which is the same failure seen one step earlier.
        const made = await rawRequest<{ id?: string }>(
          "POST",
          `/table/${table.id}/field`,
          {
            name: FORMULA_FIELD,
            type: FieldType.Formula,
            options: { expression },
          },
        );
        if (!isSuccess(made) || !made.data.id) {
          throw new Error(
            `creating the formula answered ${describeResponse(made)}`,
          );
        }
        const formulaId = made.data.id;
        const initial = expectedFor(config.initialValue, termCount);
        const filled = await readUntil(formulaId, firstId, initial);
        if (filled !== initial) {
          throw new Error(
            `the new column never filled in for the existing row: ${JSON.stringify(filled)?.slice(0, 200)}`,
          );
        }
        const created = await rawRequest<{ records?: { id: string }[] }>(
          "POST",
          `/table/${table.id}/record`,
          {
            fieldKeyType: FieldKeyType.Id,
            records: [{ fields: { [nameId]: config.createdValue } }],
          },
        );
        if (!isSuccess(created) || !created.data.records?.[0]?.id) {
          throw new Error(
            `creating a row answered ${describeResponse(created)}`,
          );
        }
        const updated = await rawRequest(
          "PATCH",
          `/table/${table.id}/record/${firstId}`,
          {
            fieldKeyType: FieldKeyType.Id,
            record: { fields: { [nameId]: config.updatedValue } },
          },
        );
        if (!isSuccess(updated)) {
          throw new Error(
            `changing a row answered ${describeResponse(updated)}`,
          );
        }
        const wrong: string[] = [];
        for (const [recordId, value] of [
          [created.data.records[0].id, config.createdValue],
          [firstId, config.updatedValue],
        ] as const) {
          const expected = expectedFor(value, termCount);
          const read = await readUntil(formulaId, recordId, expected);
          if (read !== expected) {
            wrong.push(
              `the row set to ${JSON.stringify(value)} reads ` +
                `${JSON.stringify(read)?.slice(0, 200)}`,
            );
          }
        }
        if (wrong.length > 0) {
          throw new Error(wrong.join("; "));
        }
        return { createdStatus: created.status, updatedStatus: updated.status };
      },
    );

    return { details: { tableId: table.id, termCount, routing, ...probe } };
  } finally {
    for (const tableId of createdTableIds) {
      try {
        await permanentDeleteTable(baseId, tableId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
