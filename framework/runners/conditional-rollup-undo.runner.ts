import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { OPERATION_UNDO, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  getField,
  getRecord,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ConditionalRollupUndoCaseConfig,
} from "../types";
import {
  describeResponse,
  dropTables,
  isSuccess,
  rawRequest,
  sleep,
} from "./raw-api";

// A lookup and a conditional rollup both reading a source table's amount
// column -> delete the amount column (both turn red) -> undo -> checkpoint:
// both are healthy again and show the values they showed before the delete.
//
// Undo is the promise that a mistaken delete costs nothing. The column came
// back with its values, and the error marks on the two columns built on it
// were cleared - but neither was worked out again, so both read empty where
// they had read the linked amount and the total. Cleared marks over empty
// cells look like data rather than damage.
//
// The window id is load-bearing: the undo stack is keyed by it, so the delete
// and the undo carry the same one.

const LABEL_FIELD = "Label";
const AMOUNT_FIELD = "Amount";
const LINK_FIELD = "Sources";
const LOOKUP_FIELD = "Linked amount";
const ROLLUP_FIELD = "Positive total";

export const runConditionalRollupUndoCase = async (
  bugCase: BugCaseFor<"conditional-rollup-undo">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConditionalRollupUndoCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const windowId = `e2e-lab-undo-${context.runId}`;
  const tableIds: string[] = [];

  const expectedTotal = config.amounts
    .filter((amount) => amount > 0)
    .reduce((sum, amount) => sum + amount, 0);
  const linkedAmount = config.amounts[0];
  if (config.amounts.length < 2 || expectedTotal === linkedAmount) {
    throw new Error(
      "the conditional total has to differ from the single linked amount, or the two columns cannot be told apart",
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
        fields: {
          [LABEL_FIELD]: `source-${index + 1}`,
          [AMOUNT_FIELD]: amount,
        },
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

    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: source.id,
      },
    });
    const hostId = host.records[0].id;
    await updateRecordByApi(host.id, hostId, link.id, [
      { id: source.records[0].id },
    ]);
    const lookup = await createField(host.id, {
      name: LOOKUP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      lookupOptions: {
        linkFieldId: link.id,
        foreignTableId: source.id,
        lookupFieldId: amountId,
      },
    });
    const rollup = await createField(host.id, {
      name: ROLLUP_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        foreignTableId: source.id,
        lookupFieldId: amountId,
        expression: "sum({values})",
        filter: {
          conjunction: "and",
          filterSet: [{ fieldId: amountId, operator: "isGreater", value: 0 }],
        },
      },
    });

    const readHost = async () => (await getRecord(host.id, hostId)).fields;
    const settled = async (
      matches: (fields: Record<string, unknown>) => boolean,
    ) => {
      let fields = await readHost();
      for (
        let attempt = 0;
        attempt < config.settleAttempts && !matches(fields);
        attempt++
      ) {
        await sleep(config.settleIntervalMs);
        fields = await readHost();
      }
      return fields;
    };
    const healthy = (fields: Record<string, unknown>) =>
      JSON.stringify(fields[lookup.id]) === JSON.stringify([linkedAmount]) &&
      fields[rollup.id] === expectedTotal;

    const before = await settled(healthy);
    if (!healthy(before)) {
      throw new Error(
        `before the delete the lookup reads ${JSON.stringify(before[lookup.id])} and the total ` +
          `${JSON.stringify(before[rollup.id])}, expected [${linkedAmount}] and ${expectedTotal}`,
      );
    }

    // The delete is the setup: it has to have broken both columns, or there
    // is nothing for the undo to repair.
    const deleted = await rawRequest(
      "DELETE",
      `/table/${source.id}/field/${amountId}`,
      undefined,
      { "x-window-id": windowId },
    );
    if (!isSuccess(deleted)) {
      throw new Error(
        `deleting the amount column answered ${describeResponse(deleted)}`,
      );
    }
    assertServedByV2(deleted.headers, {
      operation: "DELETE /table/{tableId}/field/{fieldId}",
      feature: "deleteField",
    });
    const brokenLookup = await getField(host.id, lookup.id);
    const brokenRollup = await getField(host.id, rollup.id);
    if (!brokenLookup.hasError || !brokenRollup.hasError) {
      throw new Error(
        `after deleting the amount column the lookup hasError=${String(brokenLookup.hasError)} and the total ` +
          `hasError=${String(brokenRollup.hasError)}; both should be broken before undo is asked to repair them`,
      );
    }

    const probe = await bugCheckpoint(
      "undoing-the-delete-restores-the-conditional-total",
      async () => {
        const undone = await rawRequest(
          "POST",
          urlBuilder(OPERATION_UNDO, { tableId: source.id }),
          undefined,
          { "x-window-id": windowId },
        );
        if (!isSuccess(undone)) {
          throw new Error(`undo answered ${describeResponse(undone)}`);
        }
        const status = (undone.data as { status?: string })?.status;
        if (status !== "fulfilled") {
          throw new Error(
            `undo reported ${JSON.stringify(status)}, expected "fulfilled": ${describeResponse(undone)}`,
          );
        }
        const restoredLookup = await getField(host.id, lookup.id);
        const restoredRollup = await getField(host.id, rollup.id);
        const after = await settled(healthy);
        const state = {
          lookupHasError: restoredLookup.hasError ?? false,
          totalHasError: restoredRollup.hasError ?? false,
          lookup: after[lookup.id] ?? null,
          total: after[rollup.id] ?? null,
        };
        if (state.lookupHasError || state.totalHasError || !healthy(after)) {
          throw new Error(
            `after undo the columns read ${JSON.stringify(state)}, expected both healthy with ` +
              `lookup [${linkedAmount}] and total ${expectedTotal}`,
          );
        }
        return state;
      },
    );

    return { details: { hostTableId: host.id, after: probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
