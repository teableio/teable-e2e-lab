import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  DELETE_RECORD_URL,
  getRecords as apiGetRecords,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RequiredLinkBlocksDeleteCaseConfig } from "../types";

// A host row whose REQUIRED manyOne link points at an owner row -> delete that
// owner row -> checkpoint: the delete is refused, and both rows are still
// intact.
//
// The delete used to go through. The foreign key was ON DELETE SET NULL, so
// the owner row vanished and a computed seed task was queued to rebuild the
// host table's link display cache. The join now missed, the generated UPDATE
// wrote NULL into a display column that is NOT NULL, and Postgres raised
// 23502 - failureKind data_constraint, dead-lettered on the first attempt
// because a constraint violation is not worth retrying. The source write had
// already committed, so the base was left in a state the product itself calls
// invalid: a required link with nothing on the other end, only repairable from
// the admin dead-letter page.
//
// "Required" only means something if the write that would break it is the one
// that fails. So the assertion is about the delete, not about the wreckage
// afterwards - and it needs no wait, which is what makes it a sharp case: the
// dead-lettering is asynchronous, but the delete answering 200 is not.
//
// The delete goes out through raw axios with `validateStatus` open. The
// generated client raises HttpError on non-2xx, which keeps the status but
// drops the response - and with it the routing headers. This case turns on a
// request that is SUPPOSED to fail, so that is the only way to prove v2 served
// the very call under test rather than a more convenient second one.

const OWNER_TITLE_FIELD = "Title";
const HOST_NAME_FIELD = "Name";
const REQUIRED_LINK_FIELD = "Required Owner";

export const runRequiredLinkBlocksDeleteCase = async (
  bugCase: BugCaseFor<"required-link-blocks-delete">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RequiredLinkBlocksDeleteCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let ownerTableId = "";
  let hostTableId = "";

  try {
    const ownerTable = await createTable(baseId, {
      name: `${suffix}-owner`,
      fields: [{ name: OWNER_TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [OWNER_TITLE_FIELD]: config.ownerTitle } }],
    });
    ownerTableId = ownerTable.id;
    const ownerRecordId = ownerTable.records[0]?.id;
    if (!ownerRecordId) {
      throw new Error(`Owner table ${ownerTableId} has no seeded row`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_NAME_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    hostTableId = hostTable.id;

    // Created before any row exists: a link can only be made required while
    // nothing could already be violating it.
    const requiredLink = await createField(hostTableId, {
      name: REQUIRED_LINK_FIELD,
      type: FieldType.Link,
      notNull: true,
      options: {
        foreignTableId: ownerTableId,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });

    const created = await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [HOST_NAME_FIELD]: config.hostTitle,
            [REQUIRED_LINK_FIELD]: { id: ownerRecordId },
          },
        },
      ],
    });
    const hostRecordId = created.records[0]?.id;
    if (!hostRecordId) {
      throw new Error(`Host row was not created in ${hostTableId}`);
    }

    const readLinkCell = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const record = response.data.records[0];
      return {
        headers: response.headers,
        recordId: record?.id,
        link: record?.fields?.[requiredLink.id] as
          | { id?: string; title?: string }
          | undefined,
      };
    };

    // Fixture verification, outside the checkpoint: the required link really
    // points at the owner row before anything is deleted. Without it, "the
    // link survived the delete" could just mean there was never a link.
    const before = await readLinkCell();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (before.link?.id !== ownerRecordId) {
      throw new Error(
        `the required link reads ${JSON.stringify(before.link)}, expected the owner row - the fixture is not in place`,
      );
    }

    const deleteResponse = await axios.delete(
      urlBuilder(DELETE_RECORD_URL, {
        tableId: ownerTableId,
        recordId: ownerRecordId,
      }),
      { validateStatus: () => true },
    );
    const deleteStatus = deleteResponse.status;
    const deleteBody =
      deleteResponse.data === undefined
        ? undefined
        : typeof deleteResponse.data === "string"
          ? deleteResponse.data
          : JSON.stringify(deleteResponse.data);
    const deleteRouting = assertServedByV2(deleteResponse.headers, {
      operation: "DELETE /table/{tableId}/record/{recordId}",
      feature: "deleteRecord",
    });

    const probe = await bugCheckpoint(
      "required-link-blocks-deleting-its-target",
      async () => {
        // A 4xx is the fix: the write that would break the rule is the write
        // that fails, in its own transaction, before anything commits. A 2xx
        // is the original bug. A 5xx would mean the rule is enforced only by
        // the database blowing up under the request, which is not a refusal
        // the caller can act on.
        if (deleteStatus < 400 || deleteStatus >= 500) {
          throw new Error(
            `deleting the owner row of a required link answered ${deleteStatus}, expected a 4xx refusal${
              deleteBody ? `: ${deleteBody}` : ""
            }`,
          );
        }

        // And the refusal has to be real, not just a status: the owner row is
        // still there and the host row still points at it.
        const owner = await apiGetRecords(ownerTableId, {
          fieldKeyType: FieldKeyType.Id,
          take: 10,
        });
        if (!owner.data.records.some((record) => record.id === ownerRecordId)) {
          throw new Error(
            `the delete answered ${deleteStatus} but the owner row is gone anyway`,
          );
        }
        const after = await readLinkCell();
        if (after.link?.id !== ownerRecordId) {
          throw new Error(
            `the delete answered ${deleteStatus} but the required link now reads ${JSON.stringify(after.link)}`,
          );
        }
        return { status: deleteStatus, body: deleteBody, link: after.link };
      },
    );

    return {
      details: {
        ownerTableId,
        hostTableId,
        routing,
        deleteRouting,
        refusedWith: probe.status,
        serverMessage: probe.body,
        requiredLinkAfter: probe.link,
      },
    };
  } finally {
    // Host first: while it exists, its required link is exactly what stops the
    // owner table from going anywhere.
    for (const tableId of [hostTableId, ownerTableId]) {
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
