import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  UPDATE_RECORD,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkCellShapeCaseConfig } from "../types";

// A link cell written in the shape v1 accepted -> checkpoint: the write lands
// and the cell holds the linked row.
//
// A link cell can hold one row or several, and v1 was tolerant about which
// shape it was handed: an array with one entry for a single-value link, a bare
// object for a multi-value one. Integrations written against v1 send those
// shapes, and so do transitional realtime payloads.
//
// v2's strict path rejected both. Nothing in the base changed and nothing the
// user did was wrong - a script that had been writing rows for a year started
// answering 400, on exactly the field that connects two tables.
//
// Strict, not typecast: typecast is the import path and is allowed to reshape
// what it gets. This is the path an API client uses when it believes it is
// sending well-formed values, which is where the tolerance was lost.
//
// The third shape here is a different fix with the same shape of failure. A
// link to a row whose primary cell is empty persists as {id, title: null},
// because there is no title to carry. Write validation then rejected the null
// title, so every later rewrite of that cell - reselecting the row, an import,
// an automation - answered 400 on a link that the product itself had written.

const NAME_FIELD = "Name";
const LINK_FIELD = "Link";
const HOST_ROW = "host-row";
const FOREIGN_ROW = "foreign-row";

export const runLinkCellShapeCase = async (
  bugCase: BugCaseFor<"link-cell-shape">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkCellShapeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let hostTableId = "";
  let foreignTableId = "";

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      // The empty-primary shape needs a foreign row with nothing in its
      // primary cell - that is what makes the stored link title null.
      records: [
        config.shape === "nullTitle"
          ? { fields: {} }
          : { fields: { [NAME_FIELD]: FOREIGN_ROW } },
      ],
    });
    foreignTableId = foreignTable.id;
    const foreignRecordId = foreignTable.records[0]?.id;

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: HOST_ROW } }],
    });
    hostTableId = hostTable.id;
    const hostRecordId = hostTable.records[0]?.id;
    if (!foreignRecordId || !hostRecordId) {
      throw new Error("the fixture rows are not in place");
    }

    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship:
          config.shape === "objectIntoMulti"
            ? Relationship.ManyMany
            : Relationship.ManyOne,
      },
    });

    const readCell = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      return {
        headers: response.headers,
        value: response.data.records[0]?.fields[linkField.id],
      };
    };

    // Fixture verification, outside the checkpoint: the cell is empty, so
    // "the write landed" cannot be satisfied by something already there.
    const before = await readCell();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (before.value !== undefined && before.value !== null) {
      throw new Error(
        `the link cell already holds ${JSON.stringify(before.value)} - the fixture is not in place`,
      );
    }

    // The shape a v1 client sends: an array for a single-value link, a bare
    // object for a multi-value one. The opposite of what the field's own
    // multiplicity would suggest, which is the whole point - v1 took either.
    const written =
      config.shape === "arrayIntoSingle"
        ? [{ id: foreignRecordId }]
        : config.shape === "objectIntoMulti"
          ? { id: foreignRecordId }
          : // What the product stores for a row with no primary value, sent
            // back the way a reselect or an import sends it.
            { id: foreignRecordId, title: null };

    // Raw axios with the status open: before the fix this request is refused,
    // and the generated client drops the response with it. typecast stays off
    // - the tolerance that was lost is on the strict path.
    const response = await axios.patch(
      urlBuilder(UPDATE_RECORD, {
        tableId: hostTableId,
        recordId: hostRecordId,
      }),
      {
        fieldKeyType: FieldKeyType.Id,
        typecast: false,
        record: { fields: { [linkField.id]: written } },
      },
      { validateStatus: () => true },
    );
    const status = response.status;
    const body =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data ?? "");

    const probe = await bugCheckpoint(
      "v1-shaped-link-write-lands",
      async () => {
        if (status < 200 || status >= 300) {
          throw new Error(
            `writing ${JSON.stringify(written)} into a ${config.shape === "objectIntoMulti" ? "multi" : "single"}-value ` +
              `link answered ${status}: ${body}`,
          );
        }
        // A 2xx that wrote nothing is the same loss with a friendlier status.
        const after = await readCell();
        const ids = (Array.isArray(after.value) ? after.value : [after.value])
          .filter(
            (entry): entry is { id?: string } =>
              typeof entry === "object" && entry !== null,
          )
          .map((entry) => entry.id);
        if (!ids.includes(foreignRecordId)) {
          throw new Error(
            `the write answered ${status} but the cell reads ${JSON.stringify(after.value)}, expected the linked ` +
              `row ${foreignRecordId}`,
          );
        }
        return { status, cell: after.value };
      },
    );

    return {
      details: {
        hostTableId,
        foreignTableId,
        shape: config.shape,
        routing,
        writeStatus: probe.status,
        cellAfter: probe.cell,
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
