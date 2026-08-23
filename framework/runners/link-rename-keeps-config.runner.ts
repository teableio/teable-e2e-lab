import { FieldType, Relationship } from "@teable/core";
import {
  axios,
  CONVERT_FIELD,
  UPDATE_FIELD,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkRenameKeepsConfigCaseConfig } from "../types";

// A link field, renamed -> checkpoint: it still points where it pointed.
//
// A link field's configuration is what makes it a link: which table it reaches,
// whether it holds one row or several, and the column it put on the other side.
// A rename says nothing about any of that, and a request that changes only the
// name should leave all of it alone.
//
// It did not. What is left is a column that looks like a link and has lost the
// thing that connects it, which the grid shows as a field that can no longer be
// filled in.
//
// The observation is the field as the product reports it afterwards, not the
// answer to the rename: what matters is what the column is now, and a reply
// that echoed the request would say nothing about that.

const NAME_FIELD = "Name";
const LINK_FIELD = "Owner";

export const runLinkRenameKeepsConfigCase = async (
  bugCase: BugCaseFor<"link-rename-keeps-config">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkRenameKeepsConfigCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let foreignTableId = "";
  let hostTableId = "";

  if (config.renamedTo === LINK_FIELD) {
    throw new Error(
      "the new name has to differ from the old one, or nothing is being renamed",
    );
  }

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-people`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "a-person" } }],
    });
    foreignTableId = foreignTable.id;

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    hostTableId = hostTable.id;
    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.ManyOne,
      },
    });

    // Fixture verification, outside the checkpoint: the link is configured
    // before it is renamed, and it put a column on the other table.
    const beforeOptions = linkField.options ?? {};
    if (beforeOptions.foreignTableId !== foreignTableId) {
      throw new Error(
        `the link starts pointing at ${JSON.stringify(beforeOptions.foreignTableId)}, expected ` +
          `${foreignTableId} - the fixture is not in place`,
      );
    }
    const foreignBefore = await getFields(foreignTableId);
    const symmetricBefore = foreignBefore.find(
      (field: { options?: { symmetricFieldId?: string } }) =>
        field.options?.symmetricFieldId === linkField.id,
    );

    const probe = await bugCheckpoint(
      "renaming-a-link-keeps-what-it-points-at",
      async () => {
        // Only the name changes. Raw axios with the status open: a build that
        // refuses the rename and one that accepts it and loses the
        // configuration are different failures, and the status tells them
        // apart.
        const response =
          config.request === "patchName"
            ? // A partial update carrying only the new name. Nothing else is
              // sent, and nothing else should change - which is what "PATCH"
              // means and what the fix is about. Sending the whole
              // configuration alongside the name is green on both columns,
              // run 32668224034.
              await axios.patch(
                urlBuilder(UPDATE_FIELD, {
                  tableId: hostTableId,
                  fieldId: linkField.id,
                }),
                { name: config.renamedTo },
                { validateStatus: () => true },
              )
            : await axios.put(
                urlBuilder(CONVERT_FIELD, {
                  tableId: hostTableId,
                  fieldId: linkField.id,
                }),
                {
                  name: config.renamedTo,
                  type: FieldType.Link,
                  options: {
                    foreignTableId,
                    relationship: Relationship.ManyOne,
                  },
                },
                { validateStatus: () => true },
              );
        const status = response.status;
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data ?? "");
        if (status < 200 || status >= 300) {
          throw new Error(`renaming the link answered ${status}: ${body}`);
        }

        const after = await getFields(hostTableId);
        const renamed = after.find(
          (field: { id: string }) => field.id === linkField.id,
        );
        if (!renamed) {
          throw new Error(
            `the field is gone after the rename: the table has ` +
              `${JSON.stringify(after.map((field: { name: string }) => field.name))}`,
          );
        }
        if (renamed.name !== config.renamedTo) {
          throw new Error(
            `the field is named ${JSON.stringify(renamed.name)}, expected ` +
              `${JSON.stringify(config.renamedTo)}`,
          );
        }
        if (renamed.type !== FieldType.Link) {
          throw new Error(
            `the field is a ${renamed.type} after the rename, expected a link`,
          );
        }
        if (renamed.options?.foreignTableId !== foreignTableId) {
          throw new Error(
            `the renamed link points at ${JSON.stringify(renamed.options?.foreignTableId)}, expected ` +
              `${foreignTableId} - renaming a column says nothing about where it points`,
          );
        }
        if (renamed.options?.relationship !== Relationship.ManyOne) {
          throw new Error(
            `the renamed link holds ${JSON.stringify(renamed.options?.relationship)} rows, expected ` +
              `${Relationship.ManyOne}`,
          );
        }

        // And the column it put on the other table is still there and still
        // pointing back. Losing that is the half a person notices from the
        // other side.
        const foreignAfter = await getFields(foreignTableId);
        const symmetricAfter = foreignAfter.find(
          (field: { options?: { symmetricFieldId?: string } }) =>
            field.options?.symmetricFieldId === linkField.id,
        );
        if (symmetricBefore && !symmetricAfter) {
          throw new Error(
            "the column the link put on the other table is gone after the rename",
          );
        }
        return {
          status,
          routing: pickRoutingHeaders(response.headers),
          options: renamed.options,
          symmetricKept: Boolean(symmetricAfter),
        };
      },
    );

    return {
      details: {
        request: config.request,
        hostTableId,
        foreignTableId,
        status: probe.status,
        routing: probe.routing,
        optionsAfterRename: probe.options,
        symmetricColumnKept: probe.symmetricKept,
      },
    };
  } finally {
    for (const tableId of [hostTableId, foreignTableId]) {
      if (!tableId) {
        continue;
      }
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
