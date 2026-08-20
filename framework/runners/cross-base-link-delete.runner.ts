import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  DELETE_RECORD_URL,
  getRecords as apiGetRecords,
  urlBuilder,
} from "@teable/openapi";
import {
  createBase,
  createField,
  createRecords,
  createSpace,
  createTable,
  deleteSpace,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CrossBaseLinkDeleteCaseConfig } from "../types";

// An OPTIONAL link reaching from one base into another -> delete the row it
// points at -> checkpoint: the delete succeeds and the link cell in the other
// base clears.
//
// Deleting a record makes the engine look up every link field pointing AT that
// record, so it can clear those cells and let the row go. That lookup was
// scoped to the record's own base. A link from a second base was therefore
// invisible to it: nothing cleared the cell, and the delete met the physical
// foreign key instead of the tidy path - refused outright, or through, leaving
// a cell that names a row which no longer exists.
//
// Neither shape tells the user what happened. A refusal blamed "a required
// link" even when the link is optional, and it named no table, so the field
// holding the row hostage lives in a base the user may not even have open.
//
// The control is the same delete on a row reached only from inside its own
// base, run outside the checkpoint: that path always worked, and if it stops
// working the fault is not the base boundary.

const OWNER_TITLE_FIELD = "Title";
const HOST_NAME_FIELD = "Name";
const LINK_FIELD = "Owner";

type Cell = { id?: string; title?: string } | undefined;

export const runCrossBaseLinkDeleteCase = async (
  bugCase: BugCaseFor<"cross-base-link-delete">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CrossBaseLinkDeleteCaseConfig = bugCase.config;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let spaceId = "";

  try {
    // Its own space: this case needs a second base, and cross-base links only
    // make sense between bases a single user can see.
    const space = await createSpace({ name: suffix });
    spaceId = space.id;
    const ownerBase = await createBase({ spaceId, name: `${suffix}-owner` });
    const remoteBase = await createBase({ spaceId, name: `${suffix}-remote` });

    // Both owner rows live in one table, so the control and the case under
    // test differ in exactly one thing: which base points at them.
    const ownerTable = await createTable(ownerBase.id, {
      name: `${suffix}-owners`,
      fields: [{ name: OWNER_TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [
        { fields: { [OWNER_TITLE_FIELD]: config.sameBaseOwnerTitle } },
        { fields: { [OWNER_TITLE_FIELD]: config.crossBaseOwnerTitle } },
      ],
    });
    const ownerIdByTitle = new Map<string, string>(
      ownerTable.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[OWNER_TITLE_FIELD]),
          record.id,
        ],
      ),
    );
    const sameBaseOwnerId = ownerIdByTitle.get(config.sameBaseOwnerTitle);
    const crossBaseOwnerId = ownerIdByTitle.get(config.crossBaseOwnerTitle);
    if (!sameBaseOwnerId || !crossBaseOwnerId) {
      throw new Error(
        `owner table ${ownerTable.id} did not seed both rows: ${JSON.stringify([...ownerIdByTitle.keys()])}`,
      );
    }

    const makeHost = async (
      baseId: string,
      name: string,
      linkBaseId: string | undefined,
      hostTitle: string,
      ownerRecordId: string,
    ) => {
      const table = await createTable(baseId, {
        name,
        fields: [{ name: HOST_NAME_FIELD, type: FieldType.SingleLineText }],
        records: [],
      });
      const field = await createField(table.id, {
        name: LINK_FIELD,
        type: FieldType.Link,
        options: {
          // Present only for the cross-base host: this is what makes the link
          // reach out of its own base.
          ...(linkBaseId ? { baseId: linkBaseId } : {}),
          foreignTableId: ownerTable.id,
          relationship: Relationship.ManyOne,
          // One-way both times, so the control and the case under test differ
          // only in the base boundary. A two-way link would also give the
          // owner table a symmetric field, and clearing that is a different
          // path than the one this watches.
          isOneWay: true,
        },
      });
      if (field.notNull) {
        throw new Error(
          `the link on ${name} came back required - this case is about an OPTIONAL link`,
        );
      }
      await createRecords(table.id, {
        fieldKeyType: FieldKeyType.Name,
        typecast: false,
        records: [
          {
            fields: {
              [HOST_NAME_FIELD]: hostTitle,
              [LINK_FIELD]: { id: ownerRecordId },
            },
          },
        ],
      });
      return table;
    };

    const sameBaseHost = await makeHost(
      ownerBase.id,
      `${suffix}-host-same-base`,
      undefined,
      config.sameBaseHostTitle,
      sameBaseOwnerId,
    );
    const crossBaseHost = await makeHost(
      remoteBase.id,
      `${suffix}-host-cross-base`,
      ownerBase.id,
      config.crossBaseHostTitle,
      crossBaseOwnerId,
    );

    const readLink = async (tableId: string) => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: 10,
      });
      return {
        headers: response.headers,
        cell: response.data.records[0]?.fields[LINK_FIELD] as Cell,
      };
    };

    // Fixture verification, outside the checkpoint: both links really point at
    // their owner row before anything is deleted. Without it, "the cell
    // cleared" cannot be told from "the cell was never filled".
    const sameBaseBefore = await readLink(sameBaseHost.id);
    const crossBaseBefore = await readLink(crossBaseHost.id);
    const routing = assertServedByV2(crossBaseBefore.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (sameBaseBefore.cell?.id !== sameBaseOwnerId) {
      throw new Error(
        `the same-base link reads ${JSON.stringify(sameBaseBefore.cell)}, expected its owner row - the fixture is not in place`,
      );
    }
    if (crossBaseBefore.cell?.id !== crossBaseOwnerId) {
      throw new Error(
        `the cross-base link reads ${JSON.stringify(crossBaseBefore.cell)}, expected its owner row - the fixture is not in place`,
      );
    }

    const deleteOwner = async (recordId: string) => {
      // Raw axios with the status open: this delete is allowed to fail, and
      // the generated client would drop the response - routing headers and
      // all - the moment it did.
      const response = await axios.delete(
        urlBuilder(DELETE_RECORD_URL, { tableId: ownerTable.id, recordId }),
        { validateStatus: () => true },
      );
      return {
        status: response.status,
        body:
          response.data === undefined
            ? undefined
            : typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data),
        headers: response.headers,
      };
    };

    // The control, outside the checkpoint: the same delete for a row reached
    // only from inside its own base.
    const control = await deleteOwner(sameBaseOwnerId);
    if (control.status < 200 || control.status >= 300) {
      throw new Error(
        `deleting a row behind a SAME-BASE optional link answered ${control.status} - optional links block deletes everywhere here, which is a different fault${
          control.body ? `: ${control.body}` : ""
        }`,
      );
    }
    const controlAfter = await readLink(sameBaseHost.id);
    if (controlAfter.cell != null) {
      throw new Error(
        `the same-base link still reads ${JSON.stringify(controlAfter.cell)} after its row was deleted - in-base cleanup is broken, which is a different fault`,
      );
    }

    const probe = await bugCheckpoint(
      "cross-base-link-clears-when-its-row-is-deleted",
      async () => {
        const deleted = await deleteOwner(crossBaseOwnerId);
        const deleteRouting = assertServedByV2(deleted.headers, {
          operation: "DELETE /table/{tableId}/record/{recordId}",
          feature: "deleteRecord",
        });
        if (deleted.status < 200 || deleted.status >= 300) {
          throw new Error(
            `deleting a row behind an OPTIONAL link from another base answered ${deleted.status}, while the identical delete behind a same-base link answered ${control.status}${
              deleted.body ? `: ${deleted.body}` : ""
            }`,
          );
        }

        const owners = await apiGetRecords(ownerTable.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 20,
        });
        if (owners.data.records.some((row) => row.id === crossBaseOwnerId)) {
          throw new Error(
            `the delete answered ${deleted.status} but the row is still there`,
          );
        }

        // The other half of the failure, and the quiet one: a 2xx with a cell
        // in the other base still naming the row that just went away.
        const after = await readLink(crossBaseHost.id);
        if (after.cell != null) {
          throw new Error(
            `the delete answered ${deleted.status} but the link in the other base still reads ${JSON.stringify(after.cell)} - it points at a row that is gone`,
          );
        }
        return { status: deleted.status, deleteRouting };
      },
    );

    return {
      details: {
        spaceId,
        ownerBaseId: ownerBase.id,
        remoteBaseId: remoteBase.id,
        ownerTableId: ownerTable.id,
        routing,
        deleteRouting: probe.deleteRouting,
        sameBaseDeleteStatus: control.status,
        crossBaseDeleteStatus: probe.status,
      },
    };
  } finally {
    if (spaceId) {
      try {
        // Trashing first is not optional: a permanent delete is a no-op on a
        // space that was never trashed, and both bases would be left behind.
        await deleteSpace(spaceId);
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
