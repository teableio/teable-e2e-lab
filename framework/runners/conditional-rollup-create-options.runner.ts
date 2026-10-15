import { FieldKeyType, FieldType } from "@teable/core";
import {
  createTable,
  getField,
  getRecord,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ConditionalRollupCreateOptionsCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A source table of amounts and a host row -> create a conditional rollup
// through the API with the options a client actually sends -> checkpoint: the
// stored options are the ones that make sense for the aggregation, and the
// row holds the number those options produce.
//
// Two ways the stored column disagreed with what was asked for:
//   - no aggregation named at all, which the editor treats as "count them" -
//     the API refused it outright;
//   - a sum carrying a sort and a limit left over from a list it was converted
//     from - kept and applied, so "the total of everything over the line"
//     silently became "the largest one".
// Both expected values are worked out from the amounts locally, so the wrong
// answer is a different number rather than a rounding.

const LABEL_FIELD = "Label";
const AMOUNT_FIELD = "Amount";

export const runConditionalRollupCreateOptionsCase = async (
  bugCase: BugCaseFor<"conditional-rollup-create-options">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalRollupCreateOptionsCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  const matching = config.amounts.filter((amount) => amount > config.threshold);
  const expectedValue =
    config.expect.aggregation === "count"
      ? matching.length
      : matching.reduce((sum, amount) => sum + amount, 0);
  // Two matches at least: with one, a sum cut to its largest value and the
  // full sum are the same number.
  if (matching.length < 2) {
    throw new Error(
      "the filter has to keep at least two amounts, or a truncated aggregation and the full one agree",
    );
  }

  try {
    const source = await createTable(baseId, {
      name: `${config.tableNamePrefix}-source-${context.runId}`,
      fields: [
        { name: LABEL_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.amounts.map((amount, index) => ({
        fields: { [LABEL_FIELD]: `item-${index + 1}`, [AMOUNT_FIELD]: amount },
      })),
    });
    tableIds.push(source.id);
    const host = await createTable(baseId, {
      name: `${config.tableNamePrefix}-host-${context.runId}`,
      fields: [
        { name: LABEL_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [LABEL_FIELD]: config.hostTitle } }],
    });
    tableIds.push(host.id);
    const amountId = source.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    if (!amountId) {
      throw new Error(`table ${source.id} has no ${AMOUNT_FIELD} column`);
    }

    const options: Record<string, unknown> = {
      foreignTableId: source.id,
      lookupFieldId: amountId,
      filter: {
        conjunction: "and",
        filterSet: [
          { fieldId: amountId, operator: "isGreater", value: config.threshold },
        ],
      },
    };
    if (config.request.expression) {
      options.expression = config.request.expression;
    }
    if (config.request.sortOrder) {
      options.sort = { fieldId: amountId, order: config.request.sortOrder };
    }
    if (config.request.limit != null) {
      options.limit = config.request.limit;
    }

    const probe = await bugCheckpoint(
      "a-conditional-rollup-stores-options-that-match-its-aggregation",
      async () => {
        const created = await rawRequest<{ id?: string }>(
          "POST",
          `/table/${host.id}/field`,
          {
            name: config.fieldName,
            type: FieldType.ConditionalRollup,
            options,
          },
        );
        if (!isSuccess(created) || !created.data?.id) {
          throw new Error(
            `creating the conditional rollup with ${JSON.stringify(config.request)} answered ${describeResponse(created)}`,
          );
        }
        const routing = assertServedByV2(created.headers, {
          operation: "POST /table/{tableId}/field",
          feature: "createField",
        });
        const fieldId = created.data.id;
        const stored = (await getField(host.id, fieldId)).options as Record<
          string,
          unknown
        >;
        const value = (await getRecord(host.id, host.records[0].id)).fields[
          fieldId
        ];
        const problems: string[] = [];
        if (stored.expression !== config.expect.expression) {
          problems.push(
            `the stored expression is ${JSON.stringify(stored.expression)}, expected ${JSON.stringify(config.expect.expression)}`,
          );
        }
        for (const key of config.expect.absentOptions) {
          if (key in stored) {
            problems.push(
              `the stored options still carry ${key}=${JSON.stringify(stored[key])}`,
            );
          }
        }
        if (value !== expectedValue) {
          problems.push(
            `the row reads ${JSON.stringify(value)}, expected ${expectedValue} (${config.expect.aggregation} of ${JSON.stringify(matching)})`,
          );
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return { routing, stored, value };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        stored: probe.stored,
        value: probe.value,
      },
    };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
