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
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { StaleLookupRecastCaseConfig } from "../types";

// Lookups whose stored metadata says TEXT while their physical column is
// something else -> rebuild them -> checkpoint: the values come back.
//
// A lookup's `db_field_type` is metadata about a column that already exists.
// When the two drift apart - the metadata left saying TEXT while the column is
// `double precision` or `jsonb` - the next backfill generates its assignment
// from the metadata and Postgres refuses it:
//
//   column "..." is of type double precision but expression is of type text
//
// The backfill is part of a `table.update` schema operation, so the failure is
// not raised to the caller. The operation goes dead - non-retryable, and the
// admin console will not replay it. What the user has is a lookup column that
// stopped filling in, and a compute panel quoting Postgres at them.
//
// So the assertion is that the value ARRIVES, and the timeout is the
// assertion: there is no error to catch, only a cell that stays empty. The
// drift is written with SQL because it is the residue of earlier migrations,
// not a state any sequence of API calls produces today.

const PEER_TITLE_FIELD = "Name";
const FOREIGN_TITLE_FIELD = "Name";
const FOREIGN_NUMBER_FIELD = "Amount";
const FOREIGN_LINK_FIELD = "Peer";
const HOST_TITLE_FIELD = "Name";
const HOST_LINK_FIELD = "Contract";
const NUMBER_LOOKUP_FIELD = "Amount Lookup";
const LINK_LOOKUP_FIELD = "Peer Lookup";

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const holdsNumber = (cell: unknown, expected: number): boolean => {
  const values = Array.isArray(cell) ? cell : [cell];
  return values.some(
    (value) => typeof value === "number" && Math.abs(value - expected) < 1e-9,
  );
};

const holdsTitle = (cell: unknown, expected: string): boolean =>
  JSON.stringify(cell ?? null).includes(expected);

export const runStaleLookupRecastCase = async (
  bugCase: BugCaseFor<"stale-lookup-recast">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: StaleLookupRecastCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const wantsNumber = config.lookups.includes("number");
  const wantsLink = config.lookups.includes("link");
  let peerTableId = "";
  let foreignTableId = "";
  let hostTableId = "";

  if (!wantsNumber && !wantsLink) {
    throw new Error("lookups is empty - the case would assert nothing");
  }
  // A display-only rebuild is a change to how a value is FORMATTED, and a
  // lookup over a link field has no formatting to change. Pairing them would
  // silently fall back to no trigger at all.
  if (config.trigger === "display-only" && wantsLink) {
    throw new Error(
      "the display-only trigger has no meaning for a link lookup - it changes number formatting",
    );
  }

  try {
    const peerTable = await createTable(baseId, {
      name: `${suffix}-peer`,
      fields: [{ name: PEER_TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [PEER_TITLE_FIELD]: config.peerTitle } }],
    });
    peerTableId = peerTable.id;
    const peerRecordId = peerTable.records[0]?.id;
    if (!peerRecordId) {
      throw new Error(`Peer table ${peerTableId} has no seeded row`);
    }

    const foreignTable = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: FOREIGN_TITLE_FIELD, type: FieldType.SingleLineText },
        { name: FOREIGN_NUMBER_FIELD, type: FieldType.Number },
      ],
      records: [],
    });
    foreignTableId = foreignTable.id;
    const foreignNumberField = foreignTable.fields.find(
      (field: { name: string }) => field.name === FOREIGN_NUMBER_FIELD,
    );
    if (!foreignNumberField) {
      throw new Error(`Foreign table ${foreignTableId} has no number field`);
    }

    // The foreign table's own link field is what gives the host a lookup whose
    // physical column is jsonb - the second half of the type mismatch.
    const foreignLinkField = await createField(foreignTableId, {
      name: FOREIGN_LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: peerTableId,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });

    const foreignRows = await createRecords(foreignTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [FOREIGN_TITLE_FIELD]: "contract-1",
            [FOREIGN_NUMBER_FIELD]: config.sourceNumber,
            [FOREIGN_LINK_FIELD]: { id: peerRecordId },
          },
        },
      ],
    });
    const foreignRecordId = foreignRows.records[0]?.id;
    if (!foreignRecordId) {
      throw new Error(`Foreign row was not created in ${foreignTableId}`);
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [],
    });
    hostTableId = hostTable.id;
    const hostLinkField = await createField(hostTableId, {
      name: HOST_LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });
    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: [
        {
          fields: {
            [HOST_TITLE_FIELD]: "host-1",
            [HOST_LINK_FIELD]: { id: foreignRecordId },
          },
        },
      ],
    });

    const numberLookup = wantsNumber
      ? await createField(hostTableId, {
          name: NUMBER_LOOKUP_FIELD,
          type: FieldType.Number,
          isLookup: true,
          lookupOptions: {
            foreignTableId,
            lookupFieldId: foreignNumberField.id,
            linkFieldId: hostLinkField.id,
          },
          // Formatting is what a display-only rebuild changes, so the field
          // has to start with some.
          options: {
            formatting: { type: "currency", precision: 2, symbol: "" },
          },
        })
      : undefined;
    const linkLookup = wantsLink
      ? await createField(hostTableId, {
          name: LINK_LOOKUP_FIELD,
          type: FieldType.Link,
          isLookup: true,
          lookupOptions: {
            foreignTableId,
            lookupFieldId: foreignLinkField.id,
            linkFieldId: hostLinkField.id,
          },
        })
      : undefined;

    const readHostRow = async () => {
      const response = await apiGetRecords(hostTableId, {
        fieldKeyType: FieldKeyType.Id,
        take: 1,
      });
      const fields = response.data.records[0]?.fields ?? {};
      return {
        headers: response.headers,
        number: numberLookup ? fields[numberLookup.id] : undefined,
        link: linkLookup ? fields[linkLookup.id] : undefined,
      };
    };

    const settled = async (poll: boolean) => {
      const deadline = Date.now() + (poll ? config.settleTimeoutMs : 0);
      let last = await readHostRow();
      for (;;) {
        const numberOk =
          !numberLookup || holdsNumber(last.number, config.sourceNumber);
        const linkOk = !linkLookup || holdsTitle(last.link, config.peerTitle);
        if (numberOk && linkOk) {
          return { ok: true as const, last };
        }
        if (Date.now() >= deadline) {
          return { ok: false as const, last };
        }
        await sleep(config.settlePollIntervalMs);
      }
    };

    // Fixture verification, outside the checkpoint: the lookups compute
    // correctly BEFORE the metadata is touched. Without this the case could
    // not tell "the drift broke the rebuild" from "these lookups never worked".
    const before = await settled(true);
    const routing = assertServedByV2(before.last.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (!before.ok) {
      throw new Error(
        `the lookups did not resolve before the drift (number=${JSON.stringify(before.last.number)}, link=${JSON.stringify(before.last.link)}) - the fixture is not in place`,
      );
    }

    // The drift: metadata says TEXT, the physical column stays what it was.
    const db = fixtureDb(context.app);
    const driftedFieldIds = [numberLookup?.id, linkLookup?.id].filter(
      (id): id is string => Boolean(id),
    );
    const drifted = await db.execute(
      `UPDATE "field" SET "db_field_type" = 'TEXT', "cell_value_type" = 'string'
        WHERE "id" = ANY($1::text[])`,
      driftedFieldIds,
    );
    if (drifted !== driftedFieldIds.length) {
      throw new Error(
        `the TEXT drift touched ${drifted} rows, expected ${driftedFieldIds.length} - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "drifted-lookups-recast-on-rebuild",
      async () => {
        // Rebuild each drifted lookup. Whichever trigger is used, it has to
        // be a REAL change: re-submitting identical options is a no-op, no
        // backfill runs, and the case would read back the values the first,
        // pre-drift pass left in the column and call that a pass.
        if (numberLookup) {
          await convertField(hostTableId, numberLookup.id, {
            type: FieldType.Number,
            isLookup: true,
            lookupOptions: {
              foreignTableId,
              lookupFieldId: foreignNumberField.id,
              linkFieldId: hostLinkField.id,
              // The semantic trigger: a filter the lookup did not have.
              ...(config.trigger === "add-filter"
                ? {
                    filter: {
                      conjunction: "and",
                      filterSet: [
                        {
                          fieldId: foreignNumberField.id,
                          operator: "isGreater",
                          value: 0,
                        },
                      ],
                    },
                  }
                : {}),
            },
            // The display-only trigger: same lookup, different precision.
            // Nothing about which values belong in the column changes, which
            // is the point - the rebuild still has to derive the right
            // physical type.
            options: {
              formatting: {
                type: "currency",
                precision: config.trigger === "display-only" ? 1 : 2,
                symbol: "",
              },
            },
          });
        }
        if (linkLookup) {
          await convertField(hostTableId, linkLookup.id, {
            type: FieldType.Link,
            isLookup: true,
            lookupOptions: {
              foreignTableId,
              lookupFieldId: foreignLinkField.id,
              linkFieldId: hostLinkField.id,
              filter: {
                conjunction: "and",
                filterSet: [
                  {
                    fieldId: foreignNumberField.id,
                    operator: "isGreater",
                    value: 0,
                  },
                ],
              },
            },
          });
        }

        const after = await settled(true);
        if (!after.ok) {
          throw new Error(
            `the rebuilt lookups never filled in: after ${config.settleTimeoutMs}ms number=${JSON.stringify(after.last.number)} (expected ${config.sourceNumber}), link=${JSON.stringify(after.last.link)} (expected to contain "${config.peerTitle}")`,
          );
        }
        return { number: after.last.number, link: after.last.link };
      },
    );

    return {
      details: {
        peerTableId,
        foreignTableId,
        hostTableId,
        routing,
        driftedFieldIds,
        numberAfter: probe.number,
        linkAfter: probe.link,
      },
    };
  } finally {
    for (const tableId of [hostTableId, foreignTableId, peerTableId]) {
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
