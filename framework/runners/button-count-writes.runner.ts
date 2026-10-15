import {
  Colors,
  FieldKeyType,
  FieldType,
  generateWorkflowId,
} from "@teable/core";
import {
  buttonClick as apiButtonClick,
  duplicateRecord as apiDuplicateRecord,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getRecord,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ButtonCountWritesCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A button column counts how many times each row's button was pressed. Two
// ways the count ended up somewhere other than where it was put, one scenario
// each:
//
//   - api-write: an integration setting the count directly (to restore it, or
//     to mark rows as already handled). The write answered 200 and was
//     dropped, so the count stayed where it was and the caller was told it had
//     moved.
//   - duplicate-record: duplicating a row that was pressed twice. The copy
//     came out already pressed twice - and with a click cap, already used up -
//     though nobody had pressed anything on it.
//
// The button carries a workflow, as a real one does: pressing a button with
// none behind it is refused, and the duplicate scenario needs real presses.

const NAME_FIELD = "Name";
const BUTTON_FIELD = "Run";

export const runButtonCountWritesCase = async (
  bugCase: BugCaseFor<"button-count-writes">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ButtonCountWritesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];

  if (config.count < 2) {
    throw new Error(
      "the count has to be at least 2, so it cannot be mistaken for a single fresh press",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.rowTitle } }],
    });
    tableIds.push(table.id);
    const button = await createField(table.id, {
      name: BUTTON_FIELD,
      type: FieldType.Button,
      options: {
        label: BUTTON_FIELD,
        color: Colors.Teal,
        workflow: {
          id: generateWorkflowId(),
          name: `${config.tableNamePrefix}-workflow`,
          isActive: true,
        },
      },
    });
    const recordId = table.records[0].id;
    const readCount = async (id: string) =>
      (await getRecord(table.id, id)).fields[button.id] ?? null;

    if (config.scenario === "api-write") {
      if ((await readCount(recordId)) !== null) {
        throw new Error("a fresh row already carries a click count");
      }
      const probe = await bugCheckpoint(
        "a-click-count-written-through-the-api-lands",
        async () => {
          const written = await rawRequest(
            "PATCH",
            `/table/${table.id}/record/${recordId}`,
            {
              fieldKeyType: FieldKeyType.Id,
              record: { fields: { [button.id]: { count: config.count } } },
            },
          );
          if (!isSuccess(written)) {
            throw new Error(
              `writing a click count of ${config.count} answered ${describeResponse(written)}`,
            );
          }
          const routing = assertServedByV2(written.headers, {
            operation: "PATCH /table/{tableId}/record/{recordId}",
            feature: "updateRecord",
          });
          const stored = await readCount(recordId);
          if (
            JSON.stringify(stored) !== JSON.stringify({ count: config.count })
          ) {
            throw new Error(
              `the write answered ${written.status} but the row reads ${JSON.stringify(stored)}, expected {"count":${config.count}}`,
            );
          }
          return { routing, stored };
        },
      );
      return { details: { tableId: table.id, stored: probe.stored } };
    }

    for (let press = 1; press <= config.count; press++) {
      const clicked = await apiButtonClick(table.id, recordId, button.id);
      assertServedByV2(clicked.headers, {
        operation: "POST button click",
        feature: "buttonClick",
      });
    }
    const sourceCount = await readCount(recordId);
    if (
      JSON.stringify(sourceCount) !== JSON.stringify({ count: config.count })
    ) {
      throw new Error(
        `after ${config.count} presses the source row reads ${JSON.stringify(sourceCount)}`,
      );
    }

    const probe = await bugCheckpoint(
      "a-duplicated-row-starts-unpressed",
      async () => {
        const duplicated = await apiDuplicateRecord(table.id, recordId);
        const routing = assertServedByV2(duplicated.headers, {
          operation: "POST /table/{tableId}/record/{recordId}/duplicate",
          feature: "duplicateRecord",
        });
        const copyId = duplicated.data?.id;
        if (!copyId || copyId === recordId) {
          throw new Error(
            `the duplicate returned ${JSON.stringify(duplicated.data)}`,
          );
        }
        const copyCount = await readCount(copyId);
        const sourceAfter = await readCount(recordId);
        if (copyCount !== null) {
          throw new Error(
            `the copy reads ${JSON.stringify(copyCount)} though nobody pressed its button - the source's count came with it`,
          );
        }
        if (JSON.stringify(sourceAfter) !== JSON.stringify(sourceCount)) {
          throw new Error(
            `duplicating moved the source's count from ${JSON.stringify(sourceCount)} to ${JSON.stringify(sourceAfter)}`,
          );
        }
        return { routing, copyId };
      },
    );
    return { details: { tableId: table.id, copyId: probe.copyId } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
