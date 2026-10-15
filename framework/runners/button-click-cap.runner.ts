import { Colors, FieldType } from "@teable/core";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ButtonClickCapCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A button column capped at a number of presses per row, with "allow reset"
// on. Two ways the cap's settings ended up meaning something nobody chose,
// one scenario each:
//
//   - non-positive-cap: a cap of 0, -1 or 1.5 was accepted and stored. A cap
//     of 0 reads as "no presses allowed" to one part of the product and "no
//     cap" to another, and a fractional one is neither.
//   - cap-turned-off: switching the cap off has to remove it and switch
//     "allow reset" off with it, because resetting a count with no cap is
//     meaningless. Clearing the cap was not expressible - a cleared cap was
//     refused - so the editor stored 0 instead and left reset on, and turning
//     the cap back on later came back with reset already enabled.

const NAME_FIELD = "Name";
const BUTTON_FIELD = "Run";

export const runButtonClickCapCase = async (
  bugCase: BugCaseFor<"button-click-cap">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ButtonClickCapCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "row" } }],
    });
    tableIds.push(table.id);
    const options = {
      label: BUTTON_FIELD,
      color: Colors.Teal,
      maxCount: config.startingCap,
      resetCount: true,
    };
    const button = await createField(table.id, {
      name: BUTTON_FIELD,
      type: FieldType.Button,
      options,
    });
    const readOptions = async () =>
      ((await getField(table.id, button.id)).options ?? {}) as Record<
        string,
        unknown
      >;
    const initial = await readOptions();
    if (
      initial.maxCount !== config.startingCap ||
      initial.resetCount !== true
    ) {
      throw new Error(
        `the button starts with ${JSON.stringify(initial)}, expected a cap of ${config.startingCap} with reset on`,
      );
    }
    const convert = (maxCount: number | null, resetCount: boolean) =>
      rawRequest("PUT", `/table/${table.id}/field/${button.id}/convert`, {
        type: FieldType.Button,
        options: { ...options, maxCount, resetCount },
      });

    if (config.scenario === "non-positive-cap") {
      const probe = await bugCheckpoint(
        "a-click-cap-must-be-a-positive-whole-number",
        async () => {
          const accepted: string[] = [];
          for (const cap of config.rejectedCaps) {
            const response = await convert(cap, true);
            const after = await readOptions();
            if (isSuccess(response) || after.maxCount !== config.startingCap) {
              accepted.push(
                `${cap} answered ${response.status} and left the cap at ${JSON.stringify(after.maxCount)}`,
              );
            }
          }
          if (accepted.length > 0) {
            throw new Error(
              `caps that are not positive whole numbers were taken: ${accepted.join("; ")}`,
            );
          }
          return { rejected: config.rejectedCaps };
        },
      );
      return { details: { tableId: table.id, ...probe } };
    }

    const probe = await bugCheckpoint(
      "turning-the-cap-off-turns-reset-off-with-it",
      async () => {
        const response = await convert(null, false);
        if (!isSuccess(response)) {
          throw new Error(
            `clearing the cap answered ${describeResponse(response)}`,
          );
        }
        const routing = assertServedByV2(response.headers, {
          operation: "PUT /table/{tableId}/field/{fieldId}/convert",
          feature: "convertField",
        });
        const after = await readOptions();
        if (after.maxCount != null || after.resetCount === true) {
          throw new Error(
            `with the cap turned off the button stores maxCount=${JSON.stringify(after.maxCount)} and ` +
              `resetCount=${JSON.stringify(after.resetCount)}, expected no cap and reset off`,
          );
        }
        return { routing, options: after };
      },
    );
    return { details: { tableId: table.id, options: probe.options } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
