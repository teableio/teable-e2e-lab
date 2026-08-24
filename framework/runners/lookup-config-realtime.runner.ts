import { FieldType, IdPrefix, Relationship } from "@teable/core";
import {
  convertField,
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { realtimeClient } from "../realtime";
import type { RealtimeSubscription } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LookupConfigRealtimeCaseConfig } from "../types";

type FieldDoc = {
  id?: string;
  cellValueType?: unknown;
  lookupOptions?: {
    lookupFieldId?: string;
    fkHostTableName?: unknown;
  };
};

// A page with a lookup column's settings open -> change which column it looks
// up -> checkpoint: what the page is holding is the new setting, and it is
// complete.
//
// Changing a lookup is a two-step edit in practice: pick the column, look at
// what came back, adjust. The change was saved but what went out to the open
// page was a stripped-down copy of the column - missing the parts that say how
// the two tables are joined, and with the kind of value left blank. A page
// that receives that has to reject it, so the dialog goes on showing the old
// setting until someone reloads.
//
// What that costs is the second step: the person makes the change, sees no
// change, and makes it again. The lab cannot judge a dialog, so the assertion
// is what the page was given: the new target, and the parts a client needs in
// order to use it at all.

const NAME_FIELD = "Name";
const FIRST_TARGET = "Owner";
const SECOND_TARGET = "Region";
const LINK_FIELD = "Account";
const LOOKUP_FIELD = "Looked up";

export const runLookupConfigRealtimeCase = async (
  bugCase: BugCaseFor<"lookup-config-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupConfigRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];
  let client: ReturnType<typeof realtimeClient> | undefined;
  let subscription: RealtimeSubscription<FieldDoc> | undefined;

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: FIRST_TARGET, type: FieldType.SingleLineText },
        { name: SECOND_TARGET, type: FieldType.SingleLineText },
      ],
      records: [
        {
          fields: {
            [NAME_FIELD]: config.foreignRowTitle,
            [FIRST_TARGET]: config.firstValue,
            [SECOND_TARGET]: config.secondValue,
          },
        },
      ],
    });
    createdTableIds.unshift(foreign.id);
    const fieldId = (name: string) =>
      foreign.fields.find((field: { name: string }) => field.name === name)?.id;
    const firstTargetId = fieldId(FIRST_TARGET);
    const secondTargetId = fieldId(SECOND_TARGET);
    if (!firstTargetId || !secondTargetId) {
      throw new Error(`Table ${foreign.id} is not in place`);
    }

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: config.hostRowTitle } }],
    });
    createdTableIds.unshift(host.id);

    const linkField = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: foreign.id,
        isOneWay: false,
      },
    });
    const lookupField = await createField(host.id, {
      name: LOOKUP_FIELD,
      type: FieldType.SingleLineText,
      isLookup: true,
      lookupOptions: {
        foreignTableId: foreign.id,
        linkFieldId: linkField.id,
        lookupFieldId: firstTargetId,
      },
    });

    client = realtimeClient(context.appUrl, context.cookie);
    subscription = await client.subscribe<FieldDoc>(
      `${IdPrefix.Field}_${host.id}`,
      lookupField.id,
      { timeoutMs: config.subscribeTimeoutMs },
    );

    // Fixture verification, outside the checkpoint: the page is holding the
    // column as it stands, pointing at the first target. Starting from the new
    // setting would make the assertion unfalsifiable.
    await subscription.waitFor(
      () =>
        subscription?.data()?.lookupOptions?.lookupFieldId === firstTargetId,
      {
        timeoutMs: config.subscribeTimeoutMs,
        describe: `the column pointing at ${FIRST_TARGET}`,
      },
    );

    const probe = await bugCheckpoint(
      "a-lookup-config-change-reaches-the-page-whole",
      async () => {
        await convertField(host.id, lookupField.id, {
          name: LOOKUP_FIELD,
          type: FieldType.SingleLineText,
          isLookup: true,
          lookupOptions: {
            foreignTableId: foreign.id,
            linkFieldId: linkField.id,
            lookupFieldId: secondTargetId,
          },
        });

        const deadline = Date.now() + config.settleTimeoutMs;
        for (;;) {
          const failures = subscription!.errors();
          if (failures.length > 0) {
            throw new Error(
              `the page errored while the change arrived: ${JSON.stringify(failures)}`,
            );
          }
          const doc = subscription!.data();
          const pointsAt = doc?.lookupOptions?.lookupFieldId;
          // Both halves: the new target, and the parts a client needs in
          // order to use the column at all. A push carrying the new target in
          // a shape the page has to reject is the failure under test.
          const complete =
            doc?.cellValueType !== null &&
            doc?.cellValueType !== undefined &&
            doc?.lookupOptions?.fkHostTableName !== null &&
            doc?.lookupOptions?.fkHostTableName !== undefined;
          if (pointsAt === secondTargetId && complete) {
            return { doc };
          }
          if (Date.now() >= deadline) {
            throw new Error(
              `after ${config.settleTimeoutMs}ms the page holds ${JSON.stringify(doc ?? null)}` +
                (pointsAt !== secondTargetId
                  ? ` - it still points at ${JSON.stringify(pointsAt)}, not the column it was changed to`
                  : " - it has the new target but not the parts a client needs to use it, so the page has " +
                    "to reject it and goes on showing the old setting"),
            );
          }
          await new Promise<void>((resolveSleep) => {
            setTimeout(resolveSleep, config.pollIntervalMs);
          });
        }
      },
    );

    return {
      details: {
        hostTableId: host.id,
        lookupFieldId: lookupField.id,
        pushedDoc: probe.doc,
      },
    };
  } finally {
    subscription?.close();
    client?.close();
    for (const tableId of createdTableIds) {
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
