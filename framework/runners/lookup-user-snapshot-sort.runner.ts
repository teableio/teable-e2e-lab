import {
  DateFormattingPreset,
  FieldKeyType,
  FieldType,
  Relationship,
  SortFunc,
  TimeFormatting,
} from "@teable/core";
import { GroupPointType, getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupUserSnapshotSortCaseConfig } from "../types";

// Source table owned by one collaborator -> host table linking to it, looking
// that collaborator up -> write two different stored snapshots of the SAME
// collaborator onto the host rows -> checkpoint: group by the lookup and sort
// by date descending, and prove the dates run straight down across the whole
// group.
//
// The snapshot drift is the fixture and it is written with SQL, because there
// is no API for it: it accumulates over months as a collaborator gains an
// avatar or changes their email, and every row keeps whatever the snapshot
// looked like when it was last computed. Re-enacting that through the product
// would mean mutating a real user account mid-case - slower, and it would
// leave the seed user changed for every case after this one.
//
// The observation stays on the record list, because that is where the user saw
// it: one group header, and inside it the years going 2026, 2025, 2026.

const SOURCE_NAME_FIELD = "Order";
const OWNER_FIELD = "Owner";
const NAME_FIELD = "Name";
const DATE_FIELD = "Payment Date";
const LINK_FIELD = "Order";
const LOOKUP_FIELD = "Owner Lookup";

export const runLookupUserSnapshotSortCase = async (
  bugCase: BugCaseFor<"lookup-user-snapshot-sort">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupUserSnapshotSortCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const owner = {
    id: globalThis.testConfig.userId,
    title: globalThis.testConfig.userName,
    email: globalThis.testConfig.email,
  };
  let sourceTableId = "";
  let hostTableId = "";

  const groups = config.snapshotGroups;
  if (groups.length < 2) {
    throw new Error(
      "at least two snapshot groups are required - one group cannot express an ordering that stops at a snapshot boundary",
    );
  }
  // Descending by date across the whole fixture: the order the view must
  // produce once the snapshot boundary stops mattering.
  const expectedNames = groups
    .flatMap((group) => group.rows)
    .slice()
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((row) => row.name);
  // The order a query that restarts its date sort at every snapshot would
  // produce. If the fixture cannot tell the two apart, the case proves nothing.
  const brokenNames = groups.flatMap((group) =>
    group.rows
      .slice()
      .sort((left, right) => right.date.localeCompare(left.date))
      .map((row) => row.name),
  );
  if (expectedNames.join(" ") === brokenNames.join(" ")) {
    throw new Error(
      "the fixture's dates do not interleave across snapshot groups - a per-snapshot sort would look identical to a correct one",
    );
  }

  try {
    const sourceTable = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: SOURCE_NAME_FIELD, type: FieldType.SingleLineText },
        {
          name: OWNER_FIELD,
          type: FieldType.User,
          options: { isMultiple: false },
        },
      ],
      records: groups.map((group) => ({
        fields: { [SOURCE_NAME_FIELD]: group.key, [OWNER_FIELD]: owner },
      })),
    });
    sourceTableId = sourceTable.id;
    const sourceOwnerField = sourceTable.fields.find(
      (field: { name: string }) => field.name === OWNER_FIELD,
    );
    if (!sourceOwnerField) {
      throw new Error(`Source table ${sourceTableId} has no ${OWNER_FIELD}`);
    }
    const sourceIdByKey = new Map<string, string>(
      sourceTable.records.map(
        (record: { id: string; fields: Record<string, unknown> }) => [
          String(record.fields[SOURCE_NAME_FIELD]),
          record.id,
        ],
      ),
    );

    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText },
        {
          name: DATE_FIELD,
          type: FieldType.Date,
          options: {
            formatting: {
              date: DateFormattingPreset.ISO,
              time: TimeFormatting.None,
              timeZone: config.timeZone,
            },
          },
        },
      ],
      records: [],
    });
    hostTableId = hostTable.id;

    const withLink = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId: sourceTableId,
        relationship: Relationship.ManyOne,
      },
    });
    const withLookup = await createField(hostTableId, {
      name: LOOKUP_FIELD,
      type: FieldType.User,
      isLookup: true,
      lookupOptions: {
        foreignTableId: sourceTableId,
        lookupFieldId: sourceOwnerField.id,
        linkFieldId: withLink.id,
      },
    });

    // Rows are created group by group, oldest dates first, so insertion order
    // is the opposite of what the sort must produce. A view that quietly falls
    // back to row order cannot pass by accident.
    await createRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: groups.flatMap((group) =>
        group.rows.map((row) => ({
          fields: {
            [NAME_FIELD]: row.name,
            [DATE_FIELD]: row.date,
            [LINK_FIELD]: { id: sourceIdByKey.get(group.key) },
          },
        })),
      ),
    });

    const nameField = hostTable.fields.find(
      (field: { name: string }) => field.name === NAME_FIELD,
    );
    const dateField = hostTable.fields.find(
      (field: { name: string }) => field.name === DATE_FIELD,
    );
    if (!nameField || !dateField) {
      throw new Error(
        `Host table ${hostTableId} is missing its fixture fields`,
      );
    }

    const db = fixtureDb(context.app);
    const { schema, table } = await db.physicalTable(hostTableId);
    const lookupColumn = await db.physicalColumn(withLookup.id);
    const nameColumn = await db.physicalColumn(nameField.id);

    // The drift itself: same collaborator id and title on every row, different
    // snapshot extras per group. Identity is what folds the group; the extras
    // are what a query ordering by the raw stored value splits on.
    for (const group of groups) {
      const snapshot = JSON.stringify({ ...owner, ...group.snapshotExtras });
      const names = group.rows.map((row) => row.name);
      const changed = await db.execute(
        `UPDATE "${schema}"."${table}" SET "${lookupColumn}" = $1::jsonb WHERE "${nameColumn}" = ANY($2::text[])`,
        snapshot,
        names,
      );
      if (changed !== names.length) {
        throw new Error(
          `snapshot drift for group "${group.key}" touched ${changed} rows, expected ${names.length}`,
        );
      }
    }

    // Fixture verification, outside the checkpoint. Two things have to hold
    // before the ordering question is even askable: every row reads back, and
    // the drifted snapshots still fold into ONE group header. If the drift had
    // split the group, "the dates run straight down inside the group" would be
    // asking about something that no longer exists.
    // Read through the openapi client rather than the init-app wrapper: the
    // wrapper returns .data, and the routing proof lives in the headers of
    // this exact response - the grouped read whose ORDER BY the bug builds.
    const groupedResponse = await apiGetRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      groupBy: [{ fieldId: withLookup.id, order: SortFunc.Asc }],
      take: expectedNames.length,
    });
    const routing = assertServedByV2(groupedResponse.headers, {
      operation: "GET /table/{tableId}/record (grouped)",
      feature: "getRecords",
    });
    const grouped = groupedResponse.data;
    if (grouped.records.length !== expectedNames.length) {
      throw new Error(
        `Seed did not land: read back ${grouped.records.length} rows, expected ${expectedNames.length}`,
      );
    }
    const headers = (grouped.extra?.groupPoints ?? []).filter(
      (point: { type: number }) => point.type === GroupPointType.Header,
    );
    if (headers.length !== 1) {
      throw new Error(
        `the drifted snapshots produced ${headers.length} group headers, expected 1 - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "date-sort-spans-the-whole-group",
      async () => {
        const sorted = await getRecords(hostTableId, {
          fieldKeyType: FieldKeyType.Name,
          groupBy: [{ fieldId: withLookup.id, order: SortFunc.Asc }],
          orderBy: [{ fieldId: dateField.id, order: SortFunc.Desc }],
          take: expectedNames.length,
        });
        const names = sorted.records.map(
          (record: { fields: Record<string, unknown> }) =>
            String(record.fields[NAME_FIELD]),
        );
        if (names.join(" ") !== expectedNames.join(" ")) {
          const perSnapshot = names.join(" ") === brokenNames.join(" ");
          throw new Error(
            `the grouped view returned [${names.join(", ")}], expected [${expectedNames.join(", ")}]` +
              (perSnapshot
                ? " - the date sort restarted at every stored snapshot instead of spanning the collaborator"
                : ""),
          );
        }
        return { names };
      },
    );

    return {
      details: {
        sourceTableId,
        hostTableId,
        routing,
        snapshotGroups: groups.map((group) => ({
          key: group.key,
          extras: group.snapshotExtras,
          rows: group.rows.map((row) => row.name),
        })),
        expectedNames,
        returnedNames: probe.names,
      },
    };
  } finally {
    for (const tableId of [hostTableId, sourceTableId]) {
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
