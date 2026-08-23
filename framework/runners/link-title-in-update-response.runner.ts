import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { axios, UPDATE_RECORD, urlBuilder } from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkTitleInUpdateResponseCaseConfig } from "../types";

// Set a link on a record -> checkpoint: the answer to that write names the row
// it was linked to.
//
// A link cell carries the id of the row it points at and that row's title -
// the title is what the grid draws. Whoever just wrote the cell reads the
// answer to their own write and puts it on screen, so a reply that carries the
// id alone leaves the cell they are looking at blank until something else
// refreshes it.
//
// The observation is the update's own response, not a read afterwards: a read
// resolves the title for itself, so a case that checked one would pass while
// the person who made the change still sees nothing.

const NAME_FIELD = "Name";
const LINK_FIELD = "Owner";
const HOST_ROW = "the-row";

export const runLinkTitleInUpdateResponseCase = async (
  bugCase: BugCaseFor<"link-title-in-update-response">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkTitleInUpdateResponseCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let foreignTableId = "";
  let hostTableId = "";

  if (!config.foreignRowTitle.trim()) {
    throw new Error(
      "the linked row needs a title - the case is about that title arriving, and an empty one cannot be " +
        "told from a missing one",
    );
  }

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-people`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.foreignRowTitle } }],
    });
    foreignTableId = foreignTable.id;
    const foreignRecordId = foreignTable.records[0]?.id;

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
    const created = await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [{ fields: { [NAME_FIELD]: HOST_ROW } }],
    });
    const hostRecordId = created.records?.[0]?.id;
    if (!foreignRecordId || !hostRecordId) {
      throw new Error("the fixture rows are not in place");
    }

    const setLink = async () =>
      axios.patch(
        urlBuilder(UPDATE_RECORD, {
          tableId: hostTableId,
          recordId: hostRecordId,
        }),
        {
          fieldKeyType: FieldKeyType.Id,
          typecast: false,
          record: { fields: { [linkField.id]: { id: foreignRecordId } } },
        },
        { validateStatus: () => true },
      );

    // For the "touch another column" shape the link is already there before
    // the write under test: what the answer has to carry is a value this
    // request did not send, merged from the record as it stands. Setting the
    // link in the same request is green on both columns - run 32663754305.
    if (config.write === "otherColumn") {
      const seeded = await setLink();
      if (seeded.status < 200 || seeded.status >= 300) {
        throw new Error(
          `seeding the link answered ${seeded.status} - the fixture is not in place`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "the-write-answers-with-the-linked-row-name",
      async () => {
        // The write, and its own answer. Raw axios so the response is in hand
        // whatever the status.
        const response =
          config.write === "otherColumn"
            ? await axios.patch(
                urlBuilder(UPDATE_RECORD, {
                  tableId: hostTableId,
                  recordId: hostRecordId,
                }),
                {
                  fieldKeyType: FieldKeyType.Name,
                  typecast: false,
                  record: { fields: { [NAME_FIELD]: config.renamedRowTitle } },
                },
                { validateStatus: () => true },
              )
            : await setLink();
        const status = response.status;
        const body =
          typeof response.data === "string"
            ? response.data
            : JSON.stringify(response.data ?? "");
        if (status < 200 || status >= 300) {
          throw new Error(`setting the link answered ${status}: ${body}`);
        }

        const responseFields = (
          response.data as { fields?: Record<string, unknown> } | undefined
        )?.fields;
        // Addressed by id when the link was written by id, by name when the
        // write named its columns - the response echoes whichever key the
        // request used.
        const cell =
          config.write === "otherColumn"
            ? responseFields?.[LINK_FIELD]
            : responseFields?.[linkField.id];
        const entries = (Array.isArray(cell) ? cell : [cell]).filter(
          (entry): entry is { id?: string; title?: string } =>
            typeof entry === "object" && entry !== null,
        );
        if (entries.length === 0) {
          throw new Error(
            `the answer to the write carries no link value at all: ${body}`,
          );
        }
        const missing = entries.filter(
          (entry) => typeof entry.title !== "string" || entry.title === "",
        );
        if (missing.length > 0) {
          throw new Error(
            `the answer to the write carries ${JSON.stringify(entries)} - no name for the row that was ` +
              "linked, so the cell in front of whoever made the change stays blank",
          );
        }
        if (entries[0].title !== config.foreignRowTitle) {
          throw new Error(
            `the answer names ${JSON.stringify(entries[0].title)}, expected ` +
              `${JSON.stringify(config.foreignRowTitle)}`,
          );
        }
        return {
          status,
          routing: pickRoutingHeaders(response.headers),
          cell: entries,
        };
      },
    );

    return {
      details: {
        write: config.write,
        foreignTableId,
        hostTableId,
        status: probe.status,
        routing: probe.routing,
        linkCellInResponse: probe.cell,
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
