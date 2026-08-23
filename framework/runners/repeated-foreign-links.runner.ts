import { FieldType, Relationship } from "@teable/core";
import {
  createTable,
  getFields,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RepeatedForeignLinksCaseConfig } from "../types";

// Create a table with two link fields pointing at the same other table, in one
// go -> checkpoint: the other table gets two distinct columns back, and the two
// links do not share storage.
//
// Linking to the same table twice is ordinary: an assignment has a requester
// and an approver, both people; an order has a shipping address and a billing
// address, both addresses. Each link puts a column on the other table too - the
// symmetric field - and those columns need names.
//
// The names were planned against the table as it stood before the request, not
// against the table as the request was building it, so both links were handed
// the same name. What follows depends on where the collision lands: a rejected
// create, one column instead of two, or - worse - the two links sharing the
// storage that carries their values, which means putting a row in one shows it
// in the other.
//
// Two things are checked because the second is invisible from the grid: the
// symmetric columns exist and are distinctly named, and the two links do not
// name the same junction table.

const NAME_FIELD = "Name";

export const runRepeatedForeignLinksCase = async (
  bugCase: BugCaseFor<"repeated-foreign-links">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RepeatedForeignLinksCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let referenceTableId = "";
  let hostTableId = "";

  if (config.linkFieldNames.length < 2) {
    throw new Error(
      "two link fields at least - one link cannot collide with anything",
    );
  }
  if (new Set(config.linkFieldNames).size !== config.linkFieldNames.length) {
    throw new Error(
      "the link field names have to differ from each other - the case is about the columns they create " +
        "on the other table, not about naming these two the same thing",
    );
  }

  try {
    const referenceTable = await createTable(baseId, {
      name: `${suffix}-reference`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "reference-row" } }],
    });
    referenceTableId = referenceTable.id;

    // Both links in the same create. That is the fixture: planning them one at
    // a time is what the product does from the field editor, and it works -
    // the collision needs two links planned against the same starting state.
    const hostTable = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        ...config.linkFieldNames.map((name) => ({
          name,
          type: FieldType.Link,
          options: {
            relationship: Relationship.ManyMany,
            foreignTableId: referenceTable.id,
          },
        })),
      ],
    });
    hostTableId = hostTable.id;

    const probe = await bugCheckpoint(
      "two-links-to-one-table-get-two-columns",
      async () => {
        const hostLinks = (hostTable.fields ?? []).filter(
          (field: { type: string }) => field.type === FieldType.Link,
        );
        if (hostLinks.length !== config.linkFieldNames.length) {
          throw new Error(
            `the table was created with ${hostLinks.length} link fields, expected ${config.linkFieldNames.length}`,
          );
        }

        const hostLinkIds = new Set(
          hostLinks.map((field: { id: string }) => field.id),
        );
        const referenceFields = await getFields(referenceTableId);
        const symmetric = referenceFields.filter(
          (field: { type: string; options?: { symmetricFieldId?: string } }) =>
            field.type === FieldType.Link &&
            field.options?.symmetricFieldId !== undefined &&
            hostLinkIds.has(field.options.symmetricFieldId),
        );
        if (symmetric.length !== config.linkFieldNames.length) {
          throw new Error(
            `the reference table got ${symmetric.length} columns back for ${config.linkFieldNames.length} links - ` +
              `it has ${JSON.stringify(referenceFields.map((field: { name: string }) => field.name))}`,
          );
        }
        const symmetricNames = symmetric.map(
          (field: { name: string }) => field.name,
        );
        if (new Set(symmetricNames).size !== symmetricNames.length) {
          throw new Error(
            `the columns the reference table got back are named ${JSON.stringify(symmetricNames)} - ` +
              "two links cannot share one name",
          );
        }

        // The invisible half: two links sharing the storage that carries their
        // values means a row put in one shows up in the other.
        const junctions = hostLinks.map(
          (field: { options?: { fkHostTableName?: string } }) =>
            field.options?.fkHostTableName ?? null,
        );
        if (junctions.some((name: string | null) => !name)) {
          throw new Error(
            `a link came back without its storage: ${JSON.stringify(junctions)}`,
          );
        }
        if (new Set(junctions).size !== junctions.length) {
          throw new Error(
            `the two links share the storage ${JSON.stringify(junctions)} - a row linked through one would ` +
              "appear in the other",
          );
        }
        return { symmetricNames, junctions };
      },
    );

    return {
      details: {
        referenceTableId,
        hostTableId,
        symmetricNames: probe.symmetricNames,
        junctionTables: probe.junctions,
      },
    };
  } finally {
    for (const tableId of [hostTableId, referenceTableId]) {
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
