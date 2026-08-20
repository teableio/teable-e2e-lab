import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ComputedBackfillRecastCaseConfig } from "../types";

// Build a small table graph -> make a computed field over it -> checkpoint:
// the value arrives.
//
// One failure, reached three ways. A computed backfill writes its result with
// an UPDATE ... FROM SELECT, and the assignment it generates has to agree with
// the physical type of the column it lands in. When it does not, Postgres
// refuses the statement:
//
//   column "..." is of type double precision but expression is of type text
//   invalid input syntax for type json
//
// The backfill runs inside a `table.update` schema operation, so nothing is
// raised to the caller. The request that started it answers normally, the
// operation retries until it is dead, and what the user has is a column that
// never filled in.
//
// That makes the settle budget the assertion in every shape here: there is no
// error to catch, only a cell that stays empty. A generous budget above a slow
// but working backfill, and far below "never", which is what the pre-fix
// behavior amounts to.
//
// This is the same family as `lookup/stale-text-metadata-*`, and deliberately
// not the same case. Those reach the mismatch by writing drifted metadata with
// SQL, because it is the residue of migrations rather than a state today's API
// produces. These three reach it through ordinary API calls - a field
// converted into a lookup, a formula written over one, a lookup added to a
// table whose rows are already linked - which is why they need no fixture-db
// and why they are worth having next to it.

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

// Both assertions are deliberately loose about the container. A lookup over a
// oneOne or manyOne link may come back as the value or as a single-element
// array depending on the shape, and none of these bugs is about which - the
// question every one of them asks is whether the value arrived at all.
const holdsNumber = (cell: unknown, expected: number): boolean => {
  const values = Array.isArray(cell) ? cell : [cell];
  return values.some(
    (value) => typeof value === "number" && Math.abs(value - expected) < 1e-9,
  );
};

const holdsTitle = (cell: unknown, expected: string): boolean =>
  JSON.stringify(cell ?? null).includes(expected);

interface ShapeBuild {
  // Tables to clean up, host first.
  tableIds: string[];
  hostTableId: string;
  // The field the checkpoint watches, resolved once the shape has made it.
  makeComputed: () => Promise<string>;
  // Reads the host row and says whether the value has landed. Split from
  // makeComputed so the fixture check can run the same read before anything
  // computed exists.
  read: (fieldId: string) => Promise<{
    headers: Record<string, unknown>;
    cell: unknown;
  }>;
  holds: (cell: unknown) => boolean;
  // Asserted before the computed field is made, outside the checkpoint: the
  // graph the shape just built is really wired up. Without it "the value never
  // arrived" and "there was never a value to arrive" are the same observation.
  verifyFixture: () => Promise<{
    headers: Record<string, unknown>;
    detail: unknown;
  }>;
}

export const runComputedBackfillRecastCase = async (
  bugCase: BugCaseFor<"computed-backfill-recast">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ComputedBackfillRecastCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;

  const readHostCell = async (hostTableId: string, fieldId: string) => {
    const response = await apiGetRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Id,
      take: 1,
    });
    return {
      headers: response.headers,
      cell: response.data.records[0]?.fields?.[fieldId],
    };
  };

  const firstRecordId = (table: { id: string; records?: { id: string }[] }) => {
    const recordId = table.records?.[0]?.id;
    if (!recordId) {
      throw new Error(`Table ${table.id} has no seeded row`);
    }
    return recordId;
  };

  // ---------------------------------------------------------------------
  // A number column converted into a lookup of a foreign formula. The host
  // column is `double precision` and stays that way; the rebuilt lookup kept
  // the metadata saying TEXT, so the backfill assigned text into it.
  // ---------------------------------------------------------------------
  const buildNumberToFormulaLookup = async (): Promise<ShapeBuild> => {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [{ fields: { Name: "contract-1" } }],
    });
    const foreignRecordId = firstRecordId(foreignTable);

    // A literal expression, so the foreign value cannot depend on anything
    // else that might be slow to compute and blur what the budget measures.
    const foreignFormula = await createField(foreignTable.id, {
      name: "Amount",
      type: FieldType.Formula,
      options: {
        expression: String(config.sourceNumber),
        formatting: { type: "currency", precision: 2, symbol: "" },
      },
    });

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText },
        {
          name: "Payment Amount",
          type: FieldType.Number,
          options: {
            formatting: { type: "currency", precision: 2, symbol: "" },
          },
        },
      ],
      records: [],
    });
    const hostNumberField = hostTable.fields.find(
      (field: { name: string }) => field.name === "Payment Amount",
    );
    if (!hostNumberField) {
      throw new Error(`Host table ${hostTable.id} has no number field`);
    }

    const hostLink = await createField(hostTable.id, {
      name: "Contract",
      type: FieldType.Link,
      options: {
        foreignTableId: foreignTable.id,
        relationship: Relationship.ManyOne,
        isOneWay: false,
      },
    });

    await createRecords(hostTable.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            Name: "host-1",
            // A value the host column can hold and the lookup cannot produce.
            // If the conversion silently leaves the old cell in place, the
            // checkpoint sees this rather than the expected number.
            "Payment Amount": config.placeholderNumber,
            Contract: { id: foreignRecordId },
          },
        },
      ],
    });

    return {
      tableIds: [hostTable.id, foreignTable.id],
      hostTableId: hostTable.id,
      read: (fieldId) => readHostCell(hostTable.id, fieldId),
      holds: (cell) => holdsNumber(cell, config.sourceNumber),
      verifyFixture: async () => {
        const before = await readHostCell(hostTable.id, hostNumberField.id);
        if (!holdsNumber(before.cell, config.placeholderNumber)) {
          throw new Error(
            `the host number cell reads ${JSON.stringify(before.cell)}, expected ${config.placeholderNumber} - the row this case converts is not in place`,
          );
        }
        return { headers: before.headers, detail: before.cell };
      },
      makeComputed: async () => {
        // A lookup over a formula field is declared as a formula that carries
        // the foreign expression; what makes it a lookup is isLookup plus the
        // link to reach it through.
        await convertField(hostTable.id, hostNumberField.id, {
          name: "Payment Amount",
          type: FieldType.Formula,
          isLookup: true,
          options: {
            expression: String(config.sourceNumber),
            formatting: { type: "currency", precision: 2, symbol: "" },
          },
          lookupOptions: {
            foreignTableId: foreignTable.id,
            lookupFieldId: foreignFormula.id,
            linkFieldId: hostLink.id,
          },
        });
        return hostNumberField.id;
      },
    };
  };

  // ---------------------------------------------------------------------
  // A text column converted into a lookup of a foreign LINK field, then a
  // formula written over that lookup. The column stays TEXT and holds link
  // titles as text, and the formula's backfill hard-cast it with ::jsonb.
  // ---------------------------------------------------------------------
  const buildTextLookupThenFormula = async (): Promise<ShapeBuild> => {
    const peerTable = await createTable(baseId, {
      name: `${suffix}-peer`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [{ fields: { Name: config.peerTitle } }],
    });
    const peerRecordId = firstRecordId(peerTable);

    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [],
    });
    const foreignLink = await createField(foreignTable.id, {
      name: "Peer Link",
      type: FieldType.Link,
      options: {
        foreignTableId: peerTable.id,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });
    const foreignRows = await createRecords(foreignTable.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        { fields: { Name: "item-1", "Peer Link": { id: peerRecordId } } },
      ],
    });
    const foreignRecordId = foreignRows.records[0]?.id;
    if (!foreignRecordId) {
      throw new Error(`Foreign row was not created in ${foreignTable.id}`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText },
        // The leftover TEXT column. It starts life as an ordinary text field
        // and keeps its physical type through the conversion below, which is
        // the whole reason the titles end up stored as text.
        { name: "Foreign Peer", type: FieldType.SingleLineText },
      ],
      records: [],
    });
    const hostTextField = hostTable.fields.find(
      (field: { name: string }) => field.name === "Foreign Peer",
    );
    if (!hostTextField) {
      throw new Error(`Host table ${hostTable.id} has no text field`);
    }

    const hostLink = await createField(hostTable.id, {
      name: "Foreign Link",
      type: FieldType.Link,
      options: {
        foreignTableId: foreignTable.id,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });
    await createRecords(hostTable.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: { Name: "host-1", "Foreign Link": { id: foreignRecordId } },
        },
      ],
    });

    // The conversion is fixture, not observation: it succeeds on both sides of
    // the fix. What the fix changed is the formula written over its result.
    await convertField(hostTable.id, hostTextField.id, {
      name: "Foreign Peer",
      type: FieldType.Link,
      isLookup: true,
      lookupOptions: {
        foreignTableId: foreignTable.id,
        lookupFieldId: foreignLink.id,
        linkFieldId: hostLink.id,
      },
    });

    return {
      tableIds: [hostTable.id, foreignTable.id, peerTable.id],
      hostTableId: hostTable.id,
      read: (fieldId) => readHostCell(hostTable.id, fieldId),
      holds: (cell) => holdsTitle(cell, config.peerTitle),
      verifyFixture: async () => {
        // The lookup itself has to have filled in. If it has not, the formula
        // below would have nothing to read and this case would go red for the
        // conversion rather than for the formula backfill it is about.
        const deadline = Date.now() + config.settleTimeoutMs;
        for (;;) {
          const seen = await readHostCell(hostTable.id, hostTextField.id);
          if (holdsTitle(seen.cell, config.peerTitle)) {
            return { headers: seen.headers, detail: seen.cell };
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `the lookup-of-link cell reads ${JSON.stringify(seen.cell)} after ${config.settleTimeoutMs}ms, expected it to hold "${config.peerTitle}" - the fixture this case writes a formula over is not in place`,
            );
          }
          await sleep(config.settlePollIntervalMs);
        }
      },
      makeComputed: async () => {
        const formula = await createField(hostTable.id, {
          name: "Peer Probe",
          type: FieldType.Formula,
          options: { expression: `{${hostTextField.id}}` },
        });
        return formula.id;
      },
    };
  };

  // ---------------------------------------------------------------------
  // A lookup of a foreign LINK field added to a host whose rows are ALREADY
  // linked. The lookup's column is jsonb from the start, and the backfill that
  // seeds it assigned a text-typed alias into it.
  // ---------------------------------------------------------------------
  const buildOneOneLinkLookup = async (): Promise<ShapeBuild> => {
    const relatedTable = await createTable(baseId, {
      name: `${suffix}-related`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [{ fields: { Name: config.peerTitle } }],
    });
    const relatedRecordId = firstRecordId(relatedTable);

    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [],
    });
    const foreignLink = await createField(foreignTable.id, {
      name: "Related",
      type: FieldType.Link,
      options: {
        foreignTableId: relatedTable.id,
        relationship: Relationship.ManyMany,
        isOneWay: true,
      },
    });
    const foreignRows = await createRecords(foreignTable.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        { fields: { Name: "opp-1", Related: [{ id: relatedRecordId }] } },
      ],
    });
    const foreignRecordId = foreignRows.records[0]?.id;
    if (!foreignRecordId) {
      throw new Error(`Foreign row was not created in ${foreignTable.id}`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: "Name", type: FieldType.SingleLineText }],
      records: [],
    });
    const hostLink = await createField(hostTable.id, {
      name: "Linked Opportunity",
      type: FieldType.Link,
      options: {
        foreignTableId: foreignTable.id,
        relationship: Relationship.OneOne,
        isOneWay: true,
      },
    });
    await createRecords(hostTable.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            Name: "submission-1",
            "Linked Opportunity": { id: foreignRecordId },
          },
        },
      ],
    });

    return {
      tableIds: [hostTable.id, foreignTable.id, relatedTable.id],
      hostTableId: hostTable.id,
      read: (fieldId) => readHostCell(hostTable.id, fieldId),
      holds: (cell) => holdsTitle(cell, config.peerTitle),
      verifyFixture: async () => {
        // The rows have to be linked BEFORE the lookup is added - that
        // ordering is the shape. A lookup added first and linked afterwards
        // fills in through a different path and does not reproduce.
        const seen = await readHostCell(hostTable.id, hostLink.id);
        if (!holdsTitle(seen.cell, "opp-1")) {
          throw new Error(
            `the host link cell reads ${JSON.stringify(seen.cell)}, expected it to hold "opp-1" - the rows are not linked, so the lookup below would be seeded over nothing`,
          );
        }
        return { headers: seen.headers, detail: seen.cell };
      },
      makeComputed: async () => {
        const lookup = await createField(hostTable.id, {
          name: "Related Lookup",
          type: FieldType.Link,
          isLookup: true,
          lookupOptions: {
            foreignTableId: foreignTable.id,
            lookupFieldId: foreignLink.id,
            linkFieldId: hostLink.id,
          },
        });
        return lookup.id;
      },
    };
  };

  const builders = {
    "number-to-formula-lookup": buildNumberToFormulaLookup,
    "text-lookup-then-formula": buildTextLookupThenFormula,
    "one-one-link-lookup": buildOneOneLinkLookup,
  } as const;

  let build: ShapeBuild | undefined;
  try {
    build = await builders[config.shape]();

    const fixture = await build.verifyFixture();
    const routing = assertServedByV2(fixture.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      `computed-backfill-lands-for-${config.shape}`,
      async () => {
        const fieldId = await build!.makeComputed();

        const deadline = Date.now() + config.settleTimeoutMs;
        let last: unknown;
        for (;;) {
          const seen = await build!.read(fieldId);
          last = seen.cell;
          if (build!.holds(last)) {
            return { fieldId, cell: last };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.settlePollIntervalMs);
        }

        throw new Error(
          `the computed cell still reads ${JSON.stringify(last ?? null)} after ${config.settleTimeoutMs}ms - the backfill never landed, which is what a schema operation killed by a type mismatch looks like from outside`,
        );
      },
    );

    return {
      details: {
        shape: config.shape,
        hostTableId: build.hostTableId,
        routing,
        fixtureCell: fixture.detail,
        computedFieldId: probe.fieldId,
        computedCell: probe.cell,
      },
    };
  } finally {
    for (const tableId of build?.tableIds ?? []) {
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
