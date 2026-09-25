import { FieldKeyType, FieldType, IdPrefix, Relationship } from "@teable/core";
import { updateRecords as apiUpdateRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertHybridComputedRuntime, assertServedByV2 } from "../engine";
import { realtimeClient } from "../realtime";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkTitleRealtimeCaseConfig } from "../types";

// A table of posts and a table of engagement rows, one row per post, with a
// link between them and a column borrowed through it -> link every row to
// its post in one batch, by id only -> checkpoint: someone watching a row sees
// the link with its title.
//
// A script matched engagement rows to posts and wrote the links in one batch,
// giving only each post's id - which is all a link needs. On screen, for
// everyone who had the table open, the whole link column then read "Untitled",
// while the borrowed columns beside it showed the post text correctly.
// Refreshing the page fixed it. The live update had sent the link as the ids it
// was given, without the titles the server knew.
//
// It only happens under the production computed-update strategy, where the
// borrowed columns are worked out in the background; the deterministic one the
// lab uses by default sends a full snapshot that hides the missing titles.

const TITLE_FIELD = "Title";
const BODY_FIELD = "Body";
const NAME_FIELD = "Name";
const LINK_FIELD = "Post";

type RecordDoc = { fields?: Record<string, unknown> };

export const runLinkTitleRealtimeCase = async (
  bugCase: BugCaseFor<"link-title-realtime">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkTitleRealtimeCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];
  let client: ReturnType<typeof realtimeClient> | undefined;

  assertHybridComputedRuntime(bugCase.id);

  try {
    const posts = await createTable(baseId, {
      name: `${suffix}-posts`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: BODY_FIELD, type: FieldType.LongText },
      ],
      records: Array.from({ length: config.rowCount }, (_, index) => ({
        fields: {
          [TITLE_FIELD]: `Post ${index}`,
          [BODY_FIELD]: `Body ${index}`,
        },
      })),
    });
    createdTableIds.unshift(posts.id);
    const bodyFieldId = posts.fields.find(
      (field: { name: string }) => field.name === BODY_FIELD,
    )?.id as string;

    const engagement = await createTable(baseId, {
      name: `${suffix}-engagement`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: Array.from({ length: config.rowCount }, (_, index) => ({
        fields: { [NAME_FIELD]: `Row ${index}` },
      })),
    });
    createdTableIds.unshift(engagement.id);

    const link = await createField(engagement.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship:
          config.relationship === "manyMany"
            ? Relationship.ManyMany
            : Relationship.ManyOne,
        foreignTableId: posts.id,
      },
    });
    const borrowedBody = await createField(engagement.id, {
      name: "Post body",
      type: FieldType.LongText,
      isLookup: true,
      lookupOptions: {
        linkFieldId: link.id,
        foreignTableId: posts.id,
        lookupFieldId: bodyFieldId,
      },
    });

    const watchedId = engagement.records[0].id as string;
    const firstPostId = posts.records[0].id as string;
    const expectedLink = { id: firstPostId, title: "Post 0" };

    client = realtimeClient(context.appUrl, context.cookie);
    const subscription = await client.subscribe<RecordDoc>(
      `${IdPrefix.Record}_${engagement.id}`,
      watchedId,
      { timeoutMs: config.subscribeTimeoutMs },
    );
    // Fixture verification, outside the checkpoint: the watcher holds the row
    // as it stands, unlinked.
    await subscription.waitFor(
      (data) => data?.fields !== undefined && data.fields[link.id] == null,
      {
        timeoutMs: config.subscribeTimeoutMs,
        describe: "the watched row, not yet linked",
      },
    );

    // The batch, by id only, the way the script wrote it.
    const multiple = config.relationship === "manyMany";
    const response = await apiUpdateRecords(engagement.id, {
      typecast: true,
      fieldKeyType: FieldKeyType.Id,
      records: engagement.records.map(
        (record: { id: string }, index: number) => {
          const target = { id: posts.records[index].id as string };
          return {
            id: record.id,
            fields: { [link.id]: multiple ? [target] : target },
          };
        },
      ),
    });
    const routing = assertServedByV2(response.headers, {
      operation: "PATCH /table/{tableId}/record",
      feature: "updateRecords",
    });

    const probe = await bugCheckpoint(
      "a-watcher-sees-a-batch-linked-row-with-its-title",
      async () => {
        const linkOf = (data: RecordDoc | undefined) => {
          const value = data?.fields?.[link.id];
          return (Array.isArray(value) ? value[0] : value) as
            | { id?: string; title?: string }
            | undefined;
        };
        try {
          await subscription.waitFor(
            (data) =>
              linkOf(data)?.id === expectedLink.id &&
              linkOf(data)?.title === expectedLink.title &&
              JSON.stringify(data?.fields?.[borrowedBody.id]).includes(
                "Body 0",
              ),
            {
              timeoutMs: config.settleTimeoutMs,
              describe: "the link with its title, and the borrowed body",
            },
          );
        } catch {
          const fields = subscription.data()?.fields ?? {};
          throw new Error(
            `after the batch, the watched row shows the link as ${JSON.stringify(fields[link.id] ?? null)} ` +
              `and the borrowed body as ${JSON.stringify(fields[borrowedBody.id] ?? null)}, expected the link ` +
              `${JSON.stringify(expectedLink)} - ` +
              (linkOf(subscription.data())?.id === expectedLink.id
                ? 'the link arrived without its title, which a grid draws as "Untitled"'
                : "the link never arrived") +
              (subscription.errors().length > 0
                ? `; socket errors: ${JSON.stringify(subscription.errors())}`
                : ""),
          );
        }
        return { link: linkOf(subscription.data()) };
      },
    );

    return {
      details: {
        tableIds: createdTableIds,
        routing,
        relationship: config.relationship,
        watchedLink: probe.link,
      },
    };
  } finally {
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
