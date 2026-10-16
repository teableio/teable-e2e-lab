import { Colors, FieldKeyType, FieldType, Role } from "@teable/core";
import { BUTTON_CLICK, urlBuilder } from "@teable/openapi";
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
  ViewerButtonClickCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";
import { signUpAndInvite } from "./second-person";

// A button wired to an active workflow, and a collaborator who may only view
// the base -> the viewer presses the button -> checkpoint: the press is
// accepted and counted, while the viewer still cannot edit the row itself.
//
// Buttons are how a base hands read-only people a safe action - request a
// review, send a report - without handing them the table. Pressing one
// counts the press on the row, and that count was treated as the viewer
// editing the row, so every press was refused with "You do not have
// permission to update rows". The refusal showed only in the console; the
// button simply did nothing.
//
// The control is the edit the viewer must still be refused: a fix that
// let the press through by granting row writes would pass the press and fail
// the control.

const NAME_FIELD = "Name";
const BUTTON_FIELD = "Request review";

export const runViewerButtonClickCase = async (
  bugCase: BugCaseFor<"viewer-button-click">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ViewerButtonClickCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  let workflowId = "";

  try {
    const { client: viewer } = await signUpAndInvite(
      `${config.tableNamePrefix}-${context.runId}@example.com`,
      Role.Viewer,
    );
    const table = await createTable(baseId, {
      name: `${config.tableNamePrefix}-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "row-1" } }],
    });
    tableIds.push(table.id);
    const nameId = table.fields[0].id;
    const recordId = table.records[0].id;
    const button = await createField(table.id, {
      name: BUTTON_FIELD,
      type: FieldType.Button,
      options: { label: BUTTON_FIELD, color: Colors.Teal },
    });

    // A real, active workflow behind the button: pressing a button with none
    // is refused for everyone, which is a different question.
    const step = async <T>(
      what: string,
      method: "POST" | "PUT",
      url: string,
      body: unknown,
    ) => {
      const response = await rawRequest<T>(method, url, body);
      if (!isSuccess(response)) {
        throw new Error(`${what} answered ${describeResponse(response)}`);
      }
      return response.data;
    };
    const workflow = await step<{ id: string }>(
      "creating the workflow",
      "POST",
      `/base/${baseId}/workflow`,
      { name: `${config.tableNamePrefix}-${context.runId}` },
    );
    workflowId = workflow.id;
    const trigger = await step<{ id: string }>(
      "adding the button trigger",
      "POST",
      `/base/${baseId}/workflow/${workflowId}/trigger`,
      {
        type: "buttonClick",
        config: { tableId: table.id, watchFieldIds: [button.id] },
      },
    );
    await step(
      "adding the action",
      "POST",
      `/base/${baseId}/workflow/${workflowId}/action`,
      {
        parentNodeId: trigger.id,
        type: "getRecords",
        config: { tableId: table.id, viewId: table.views[0].id },
      },
    );
    await step(
      "activating the workflow",
      "PUT",
      `/base/${baseId}/workflow/${workflowId}/active`,
      { method: "activate" },
    );
    if ((await getRecord(table.id, recordId)).fields[button.id] != null) {
      throw new Error("the button starts with a count");
    }
    const listed = await rawRequest("GET", `/table/${table.id}/record`);
    assertServedByV2(listed.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-viewer-can-press-a-button-but-not-edit-the-row",
      async () => {
        const pressed = await viewer.post(
          urlBuilder(BUTTON_CLICK, {
            tableId: table.id,
            recordId,
            fieldId: button.id,
          }),
          undefined,
          { validateStatus: () => true },
        );
        if (pressed.status >= 200 && pressed.status < 300) {
          assertServedByV2(pressed.headers as Record<string, unknown>, {
            operation: "POST button click",
            feature: "buttonClick",
          });
        }
        const count =
          (await getRecord(table.id, recordId)).fields[button.id] ?? null;
        if (
          pressed.status < 200 ||
          pressed.status >= 300 ||
          JSON.stringify(count) !== JSON.stringify({ count: 1 })
        ) {
          throw new Error(
            `the viewer's press answered ${pressed.status} ${JSON.stringify(pressed.data)} and the row's count reads ` +
              `${JSON.stringify(count)}, expected the press accepted and counted once`,
          );
        }
        const edit = await viewer.patch(
          `/table/${table.id}/record/${recordId}`,
          {
            fieldKeyType: FieldKeyType.Id,
            record: { fields: { [nameId]: "edited by a viewer" } },
          },
          { validateStatus: () => true },
        );
        if (edit.status !== 403) {
          throw new Error(
            `the viewer's press now works, but so does editing the row (${edit.status}) - the press must not come with row writes`,
          );
        }
        return { pressStatus: pressed.status, count };
      },
    );

    return { details: { tableId: table.id, ...probe } };
  } finally {
    if (workflowId) {
      try {
        await rawRequest("DELETE", `/base/${baseId}/workflow/${workflowId}`);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (workflow ${workflowId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
