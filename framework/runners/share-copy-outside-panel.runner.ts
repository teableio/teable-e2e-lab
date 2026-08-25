import { BaseNodeResourceType } from "@teable/openapi";
import {
  copyBaseShare,
  createBase,
  createBaseNode,
  createBaseShare,
  createPluginPanel as apiCreatePluginPanel,
  getTableList as apiGetTableList,
  listPluginPanels as apiListPluginPanels,
  moveBaseNode as apiMoveBaseNode,
  permanentDeleteBase,
  updateBaseShare,
} from "@teable/openapi";
import { FieldType } from "@teable/core";
import { createTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ShareCopyOutsidePanelCaseConfig } from "../types";

// A base sharing one folder, with a dashboard panel sitting on a table outside
// that folder -> save the share into another space -> checkpoint: the copy is
// made, and it carries only what was shared.
//
// Sharing a folder rather than the whole base is how a base is handed over in
// part: the customer gets the tables meant for them and nothing else. What is
// outside the folder is not their business, which is the entire point.
//
// A panel on a table outside the folder broke the copy. The person receiving
// the share sees it fail, with nothing to act on: the thing that broke it is
// in a part of the base they cannot see and were never meant to. The person
// sharing has no reason to connect a dashboard on an unrelated table to a
// customer who cannot open their share.
//
// The case also reads what came across, because exporting the outside panel
// rather than skipping it would make the copy succeed while handing over the
// name of a table that was deliberately left out.

const NAME_FIELD = "Name";

export const runShareCopyOutsidePanelCase = async (
  bugCase: BugCaseFor<"share-copy-outside-panel">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ShareCopyOutsidePanelCaseConfig = bugCase.config;
  const spaceId = globalThis.testConfig.spaceId;
  let sourceBaseId = "";
  let copiedBaseId = "";

  try {
    const sourceBase = await createBase({
      name: `${config.baseNamePrefix}-source-${context.runId}`,
      spaceId,
    });
    sourceBaseId = sourceBase.data.id;

    const folder = await createBaseNode(sourceBaseId, {
      resourceType: BaseNodeResourceType.Folder,
      name: config.folderName,
    });
    const folderId = folder.data.id;

    // The table the customer is meant to get, moved into the shared folder.
    const inside = await createTable(sourceBaseId, {
      name: config.insideTableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "a-row" } }],
    });
    await apiMoveBaseNode(sourceBaseId, inside.id, { parentId: folderId });

    // A table that stays out of the folder - the part of the base that is not
    // being handed over.
    const outside = await createTable(sourceBaseId, {
      name: config.outsideTableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });

    await apiCreatePluginPanel(outside.id, { name: config.outsidePanelName });
    await apiCreatePluginPanel(inside.id, { name: config.insidePanelName });

    // Fixture verification, outside the checkpoint: the folder holds only the
    // inside table, and both panels exist. If the outside table were in the
    // folder there would be nothing outside the shared scope, and the case
    // would be about an ordinary copy.
    const insidePanels = await apiListPluginPanels(inside.id);
    const outsidePanels = await apiListPluginPanels(outside.id);
    if (insidePanels.data.length !== 1 || outsidePanels.data.length !== 1) {
      throw new Error(
        `the fixture panels are not in place: inside ${JSON.stringify(insidePanels.data.map((panel) => panel.name))}, ` +
          `outside ${JSON.stringify(outsidePanels.data.map((panel) => panel.name))}`,
      );
    }

    const share = await createBaseShare(sourceBaseId, { nodeId: folderId });
    const shareId = share.data.shareId;
    // Saving a share elsewhere is off by default; without it every save is
    // refused and the case never reaches its question.
    await updateBaseShare(sourceBaseId, shareId, { allowSave: true });

    const probe = await bugCheckpoint(
      "a-share-copies-past-a-panel-outside-it",
      async () => {
        // A refused copy throws here, which is the report.
        const copied = await copyBaseShare(shareId, {
          spaceId,
          name: `${config.baseNamePrefix}-copy-${context.runId}`,
          withRecords: true,
        });
        copiedBaseId = copied.data.id;
        if (!copiedBaseId) {
          throw new Error(
            `copying the share produced no base: ${JSON.stringify(copied.data)}`,
          );
        }

        const tables = await apiGetTableList(copiedBaseId);
        const names = tables.data.map((table) => table.name).sort();
        if (names.join(" ") !== config.insideTableName) {
          throw new Error(
            `the copy holds [${names.join(", ")}], expected only ${config.insideTableName} - ` +
              "the part of the base that was not shared came across",
          );
        }
        const copiedPanels = await apiListPluginPanels(tables.data[0].id);
        const panelNames = copiedPanels.data.map((panel) => panel.name).sort();
        if (panelNames.join(" ") !== config.insidePanelName) {
          throw new Error(
            `the copied table carries panels [${panelNames.join(", ")}], expected only ${config.insidePanelName}`,
          );
        }
        return { copiedBaseId, names, panelNames };
      },
    );

    return {
      details: {
        sourceBaseId,
        copiedBaseId: probe.copiedBaseId,
        tablesInCopy: probe.names,
        panelsInCopy: probe.panelNames,
      },
    };
  } finally {
    for (const id of [copiedBaseId, sourceBaseId]) {
      if (!id) {
        continue;
      }
      try {
        await permanentDeleteBase(id);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (base ${id}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
