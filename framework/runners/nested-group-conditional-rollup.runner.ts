import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { NestedGroupConditionalRollupCaseConfig } from "../types";

// A conditional total whose condition holds a GROUP - match on a shared
// reference, and within that, either of two other things -> checkpoint: the
// count is of the rows the whole condition describes.
//
// "Orders for this customer that are either unpaid or flagged for review" is
// one condition with a bracket in it, and the interface builds it as a group
// inside a group. The fast path that answers this kind of column read the outer
// conditions and dropped the bracket entirely, so the column counted every row
// that matched the customer - the bracket might as well not have been typed.
//
// The count is wrong upwards and looks ordinary: it is a count of real rows for
// the right customer, just not the ones asked for. Nothing marks the column, and
// the condition is still displayed in full when the column is reopened, so
// there is nothing to see.
//
// A second column runs beside it with the same reference match and a FLAT
// condition. It is the control: it goes through the same fast path, and if it
// were wrong too then the reference match itself is broken and this case is
// about something else.

const NAME_FIELD = "Name";
const MATCH_FIELD = "MatchKey";
const FLAG_A_FIELD = "FlagA";
const FLAG_B_FIELD = "FlagB";
const NESTED_COUNT_FIELD = "Count with the bracket";
const FLAT_COUNT_FIELD = "Count without one";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runNestedGroupConditionalRollupCase = async (
  bugCase: BugCaseFor<"nested-group-conditional-rollup">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: NestedGroupConditionalRollupCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  // The two conditions the runner builds, written once so the expected answers
  // and the filters cannot drift apart.
  const insideTheBracket = (row: { flagA: string; flagB: string }) =>
    row.flagA === config.bracketFlagAValue ||
    row.flagB === config.bracketFlagBValue;
  const flatCondition = (row: { flagA: string }) =>
    row.flagA === config.flatFlagAValue;

  const expected = config.hosts.map((host) => {
    const matched = config.sourceRows.filter(
      (row) => row.matchKey === host.matchKey,
    );
    return {
      host: host.name,
      matchedByReference: matched.length,
      nested: matched.filter(insideTheBracket).length,
      flat: matched.filter(flatCondition).length,
    };
  });

  // The guard that makes this case worth running. If the bracket never excludes
  // anything, a build that dropped it entirely counts the same rows and the
  // case is green on both sides of the fix.
  if (!expected.some((row) => row.nested < row.matchedByReference)) {
    throw new Error(
      `no host has a row that matches the reference and falls outside the bracket: ${JSON.stringify(expected)}. ` +
        "A condition whose bracket excludes nothing cannot tell a dropped bracket from an applied one",
    );
  }
  if (!expected.some((row) => row.nested > 0)) {
    throw new Error(
      "no host counts anything at all - a column stuck on zero would satisfy this case for the wrong reason",
    );
  }
  if (!expected.some((row) => row.matchedByReference === 0)) {
    throw new Error(
      "no host without matching rows - the row that should count nothing is what says the reference match still applies",
    );
  }

  try {
    const source = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: MATCH_FIELD, type: FieldType.SingleLineText },
        { name: FLAG_A_FIELD, type: FieldType.SingleLineText },
        { name: FLAG_B_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.sourceRows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          [MATCH_FIELD]: row.matchKey,
          [FLAG_A_FIELD]: row.flagA,
          [FLAG_B_FIELD]: row.flagB,
        },
      })),
    });
    createdTableIds.unshift(source.id);
    const fieldId = (name: string) => {
      const found = source.fields.find(
        (field: { name: string }) => field.name === name,
      )?.id;
      if (!found) {
        throw new Error(`the source table has no ${name} column`);
      }
      return found as string;
    };
    const sourceMatchId = fieldId(MATCH_FIELD);
    const sourceFlagAId = fieldId(FLAG_A_FIELD);
    const sourceFlagBId = fieldId(FLAG_B_FIELD);
    const sourceNameId = fieldId(NAME_FIELD);

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: MATCH_FIELD, type: FieldType.SingleLineText },
      ],
      records: config.hosts.map((row) => ({
        fields: { [NAME_FIELD]: row.name, [MATCH_FIELD]: row.matchKey },
      })),
    });
    createdTableIds.unshift(host.id);
    const hostMatchId = host.fields.find(
      (field: { name: string }) => field.name === MATCH_FIELD,
    )?.id as string;

    const referenceMatch = {
      fieldId: sourceMatchId,
      operator: "is",
      value: { type: "field", fieldId: hostMatchId },
    };

    // The column under test: the reference match, and inside it a bracket.
    await createField(host.id, {
      name: NESTED_COUNT_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        foreignTableId: source.id,
        lookupFieldId: sourceNameId,
        expression: "countall({values})",
        filter: {
          conjunction: "and",
          filterSet: [
            referenceMatch,
            {
              conjunction: "or",
              filterSet: [
                {
                  fieldId: sourceFlagAId,
                  operator: "is",
                  value: config.bracketFlagAValue,
                },
                {
                  fieldId: sourceFlagBId,
                  operator: "is",
                  value: config.bracketFlagBValue,
                },
              ],
            },
          ],
        },
      },
    });

    // The control, beside it: same reference match, no bracket.
    await createField(host.id, {
      name: FLAT_COUNT_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        foreignTableId: source.id,
        lookupFieldId: sourceNameId,
        expression: "countall({values})",
        filter: {
          conjunction: "and",
          filterSet: [
            referenceMatch,
            {
              fieldId: sourceFlagAId,
              operator: "is",
              value: config.flatFlagAValue,
            },
          ],
        },
      },
    });

    const readHosts = async () => {
      const response = await apiGetRecords(host.id, {
        fieldKeyType: FieldKeyType.Name,
        take: config.hosts.length,
      });
      const byName = new Map(
        response.data.records.map((record) => [
          String(record.fields[NAME_FIELD]),
          record.fields,
        ]),
      );
      return { headers: response.headers, byName };
    };

    // Settling on the CONTROL reaching its answers: that column is correct on
    // both sides of the fix, so waiting for it is waiting for the computation
    // to finish rather than for the bug to appear or disappear.
    const deadline = Date.now() + config.settleTimeoutMs;
    let settled = await readHosts();
    for (;;) {
      const controlReady = expected.every(
        (row) =>
          Number(settled.byName.get(row.host)?.[FLAT_COUNT_FIELD] ?? 0) ===
          row.flat,
      );
      if (controlReady || Date.now() >= deadline) {
        break;
      }
      await sleep(config.pollIntervalMs);
      settled = await readHosts();
    }

    const routing = assertServedByV2(settled.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-condition-with-a-bracket-in-it-counts-what-it-says",
      async () => {
        const observed = expected.map((row) => ({
          host: row.host,
          withBracket: Number(
            settled.byName.get(row.host)?.[NESTED_COUNT_FIELD] ?? 0,
          ),
          expectedWithBracket: row.nested,
          withoutBracket: Number(
            settled.byName.get(row.host)?.[FLAT_COUNT_FIELD] ?? 0,
          ),
          expectedWithoutBracket: row.flat,
          rowsMatchingTheReferenceAlone: row.matchedByReference,
        }));

        // The control first. If the flat condition is wrong too, the reference
        // match itself is broken and the bracket is not what this is about.
        const controlWrong = observed.filter(
          (row) => row.withoutBracket !== row.expectedWithoutBracket,
        );
        if (controlWrong.length > 0) {
          throw new Error(
            `the control column, which has no bracket, is wrong as well: ${JSON.stringify(observed)}. ` +
              "The reference match itself is not working, so this is not the nested-group bug",
          );
        }

        const wrong = observed.filter(
          (row) => row.withBracket !== row.expectedWithBracket,
        );
        if (wrong.length > 0) {
          throw new Error(
            `the column whose condition has a bracket counts ${JSON.stringify(observed)}. ` +
              "A count equal to rowsMatchingTheReferenceAlone is the bracket having been dropped",
          );
        }
        return { observed };
      },
    );

    return {
      details: {
        sourceTableId: source.id,
        hostTableId: host.id,
        routing,
        ...probe,
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
