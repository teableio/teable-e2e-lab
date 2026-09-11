import { FieldType } from "@teable/core";
import { axios, urlBuilder } from "@teable/openapi";
import { createTable } from "../../../utils/init-app";
import { withRestrictedPerson } from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { HiddenNodeStillReferencedCaseConfig } from "../types";

// A folder holding two tables, one of which a role keeps from somebody -> that
// person asks for what is in the base -> checkpoint: the table they may not see
// is not named anywhere in the answer.
//
// Withholding a table is meant to make it not exist as far as that person is
// concerned. The list they are given leaves it out, which is the part everybody
// checks.
//
// What was not left out was the folder's own record of what is inside it. The
// table was gone from the list and still named in its parent's contents, so the
// answer described a thing the same answer refused to describe - and anything
// reading it (the sidebar, a picker, an export) had an id it could ask about,
// for a table nobody meant them to know exists.
//
// The visible table rides along as the control. An answer that named nothing at
// all would also hide the withheld one, and would be a different fault.

const NAME_FIELD = "Name";
const GET_BASE_NODE_LIST = "/base/{baseId}/node/list";
const GET_BASE_NODE_TREE = "/base/{baseId}/node/tree";
const CREATE_BASE_NODE = "/base/{baseId}/node";
const MOVE_BASE_NODE = "/base/{baseId}/node/{nodeId}/move";

interface NodeSummary {
  id: string;
  parentId?: string | null;
  resourceId?: string;
  children?: unknown;
}

export const runHiddenNodeStillReferencedCase = async (
  bugCase: BugCaseFor<"hidden-node-still-referenced">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: HiddenNodeStillReferencedCaseConfig = bugCase.config;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let person: Awaited<ReturnType<typeof withRestrictedPerson>> | undefined;
  let hiddenTableId = "";
  let visibleTableId = "";
  let folderId = "";
  let personBaseId = "";

  try {
    person = await withRestrictedPerson({
      namePrefix: config.namePrefix,
      runId: context.runId,
      buildTables: async (baseId) => {
        personBaseId = baseId;
        const folder = await axios.post<NodeSummary>(
          urlBuilder(CREATE_BASE_NODE, { baseId }),
          { resourceType: "folder", name: `${suffix}-folder` },
          { validateStatus: () => true },
        );
        if (folder.status < 200 || folder.status >= 300 || !folder.data?.id) {
          throw new Error(
            `making a folder answered ${folder.status}: ${JSON.stringify(folder.data)}`,
          );
        }
        folderId = folder.data.id;

        const tables = [];
        for (const name of [config.hiddenTableName, config.visibleTableName]) {
          const table = await createTable(baseId, {
            name: `${suffix}-${name}`,
            fields: [
              {
                name: NAME_FIELD,
                type: FieldType.SingleLineText,
                isPrimary: true,
              },
            ],
            records: [{ fields: { [NAME_FIELD]: name } }],
          });
          tables.push(table);
        }
        hiddenTableId = tables[0]!.id;
        visibleTableId = tables[1]!.id;

        // Both of them inside the folder, which is what gives the folder a
        // record of its contents to be wrong about.
        const nodes = await axios.get<NodeSummary[]>(
          urlBuilder(GET_BASE_NODE_LIST, { baseId }),
          { validateStatus: () => true },
        );
        for (const tableId of [hiddenTableId, visibleTableId]) {
          const node = nodes.data.find((item) => item.resourceId === tableId);
          if (!node) {
            throw new Error(
              `the table ${tableId} has no node in the base: ${JSON.stringify(nodes.data)}`,
            );
          }
          const moved = await axios.put(
            urlBuilder(MOVE_BASE_NODE, { baseId, nodeId: node.id }),
            { parentId: folderId },
            { validateStatus: () => true },
          );
          if (moved.status < 200 || moved.status >= 300) {
            throw new Error(
              `moving ${tableId} into the folder answered ${moved.status}: ${JSON.stringify(moved.data)}`,
            );
          }
        }

        // The role names only the table this person may work in. A table the
        // role does not name is not theirs at all, which is how a whole table
        // is withheld - naming it with an action withheld is a different
        // shape, and `table|read` is not something a role rule accepts (run
        // 34574388667).
        return [
          {
            tableId: visibleTableId,
            disabledActions: [],
          },
        ];
      },
    });

    const askAs = (url: string) =>
      person!.axios.get<NodeSummary[]>(
        urlBuilder(url, { baseId: personBaseId }),
        { validateStatus: () => true },
      );

    // Fixture verification, outside the checkpoint: the person can see the base
    // at all, the visible table is theirs to see, and the withheld one is
    // genuinely withheld from the list. Without the last, there is nothing the
    // references could be wrong about.
    const listed = await askAs(GET_BASE_NODE_LIST);
    if (listed.status !== 200) {
      throw new Error(
        `the restricted person cannot read the base's contents at all (${listed.status}): ${JSON.stringify(listed.data)}`,
      );
    }
    const routing = pickRoutingHeaders(listed.headers);
    const listedResourceIds = listed.data.map((node) => node.resourceId);
    if (!listedResourceIds.includes(visibleTableId)) {
      throw new Error(
        `the table the role leaves alone is missing from what the person is given: ${JSON.stringify(listedResourceIds)}`,
      );
    }
    if (listedResourceIds.includes(hiddenTableId)) {
      throw new Error(
        "the withheld table is listed outright for the restricted person - the role is not withholding it, so " +
          "there is nothing here about references",
      );
    }

    const probe = await bugCheckpoint(
      "a-withheld-table-is-not-named-anywhere",
      async () => {
        const mentions: { where: string; text: string }[] = [];
        for (const [where, url] of [
          ["the list of what is in the base", GET_BASE_NODE_LIST],
          ["the tree the sidebar draws", GET_BASE_NODE_TREE],
        ] as const) {
          const answer = await askAs(url);
          if (answer.status !== 200) {
            throw new Error(
              `${where} answered ${answer.status}: ${JSON.stringify(answer.data)}`,
            );
          }
          const text = JSON.stringify(answer.data);
          if (text.includes(hiddenTableId)) {
            mentions.push({ where, text: text.slice(0, 200) });
          }
        }
        if (mentions.length > 0) {
          throw new Error(
            `the table the person may not see is named in ${JSON.stringify(mentions.map((m) => m.where))} - ` +
              `the folder still records it among its contents, so whatever reads the answer has an id to ask ` +
              `about for a table nobody meant them to know exists: ${JSON.stringify(mentions[0]?.text)}`,
          );
        }
        return { checked: 2 };
      },
    );

    return {
      details: {
        baseId: personBaseId,
        folderId,
        hiddenTableId,
        visibleTableId,
        answersChecked: probe.checked,
        routing,
      },
    };
  } finally {
    if (person) {
      try {
        await person.cleanUp();
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
