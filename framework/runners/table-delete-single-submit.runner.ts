import { FieldKeyType, FieldType } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { openBrowserPage } from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { TableDeleteSingleSubmitCaseConfig } from "../types";

const TITLE_FIELD = "Name";

const deferred = () => {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const runTableDeleteSingleSubmitCase = async (
  bugCase: BugCaseFor<"table-delete-single-submit">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: TableDeleteSingleSubmitCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let targetTableId = "";
  let fallbackTableId = "";
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;

  try {
    const fallbackTable = await createTable(baseId, {
      name: `${suffix}-fallback`,
      fields: [{ name: TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [TITLE_FIELD]: "fallback-row" } }],
    });
    fallbackTableId = fallbackTable.id;

    const targetTable = await createTable(baseId, {
      name: `${suffix}-target`,
      fields: [{ name: TITLE_FIELD, type: FieldType.SingleLineText }],
      records: Array.from({ length: config.recordCount }, (_, index) => ({
        fields: { [TITLE_FIELD]: `delete-row-${index + 1}` },
      })),
    });
    targetTableId = targetTable.id;
    const viewId = targetTable.views[0]?.id;
    if (!viewId) {
      throw new Error(`target table ${targetTableId} has no default view`);
    }

    const warmup = await apiGetRecords(targetTableId, {
      fieldKeyType: FieldKeyType.Id,
      take: config.recordCount,
    });
    const routing = assertServedByV2(warmup.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (warmup.data.records.length !== config.recordCount) {
      throw new Error(
        `target table has ${warmup.data.records.length} rows, expected ${config.recordCount}`,
      );
    }

    browser = await openBrowserPage(context);
    await browser.page.goto(
      `${browser.frontendUrl}/base/${baseId}/table/${targetTableId}/${viewId}`,
      { waitUntil: "domcontentloaded", timeout: 120_000 },
    );

    const targetNode = browser.page.locator(
      `[data-table-id="${targetTableId}"]`,
    );
    await withTimeout(
      (async () => {
        while ((await targetNode.count()) === 0) {
          await browser!.page.waitForTimeout(100);
        }
      })(),
      30_000,
      `target table ${targetTableId} did not appear in the sidebar`,
    );
    await targetNode.hover();
    await targetNode.locator("button").last().click();
    const deleteItem = browser.page
      .locator('[role="menuitem"]:has(svg.lucide-trash)')
      .last();
    if ((await deleteItem.count()) === 0) {
      throw new Error("the table menu did not expose its delete action");
    }
    await deleteItem.click();

    const dialog = browser.page.locator('[role="dialog"]').last();
    const dialogButtons = dialog.locator("button");
    const dialogButtonCount = await dialogButtons.count();
    if (dialogButtonCount < 2) {
      throw new Error("the table delete confirmation dialog did not open");
    }
    // ConfirmDialog renders its close X after the footer, so confirmation is
    // the penultimate button (cancel, confirm, close).
    const confirmButton = dialogButtons.nth(dialogButtonCount - 2);

    const releaseDelete = deferred();
    const firstDelete = deferred();
    let deleteRequestCount = 0;
    const deleteUrls: string[] = [];
    await browser.page.route("**/api/**", async (route) => {
      const request = route.request();
      if (
        request.method() !== "DELETE" ||
        !new URL(request.url()).pathname.startsWith(`/api/base/${baseId}/`)
      ) {
        await route.continue();
        return;
      }
      deleteRequestCount += 1;
      deleteUrls.push(request.url());
      if (deleteRequestCount === 1) {
        firstDelete.resolve();
        await releaseDelete.promise;
        await route.continue();
        return;
      }
      await route.abort("blockedbyclient");
    });

    await confirmButton.click();
    await withTimeout(
      firstDelete.promise,
      15_000,
      "the confirmation action did not issue a delete request",
    );

    let probe:
      | { deleteRequestCount: number; disabled: boolean; spinnerCount: number }
      | undefined;
    try {
      probe = await bugCheckpoint(
        "pending-delete-is-loading-and-single-submit",
        async () => {
          const disabled = await confirmButton.isDisabled();
          const spinnerCount = await confirmButton.locator("svg").count();
          if (!disabled) {
            throw new Error(
              "the confirm button stayed enabled while its delete request was pending",
            );
          }
          if (spinnerCount === 0) {
            throw new Error(
              "the confirm button did not show a loading indicator while deletion was pending",
            );
          }

          await confirmButton.click({ force: true, clickCount: 3 });
          await browser!.page.keyboard.press("Enter");
          await browser!.page.keyboard.press("Space");
          await browser!.page.waitForTimeout(config.duplicateProbeMs);
          if (deleteRequestCount !== 1) {
            throw new Error(
              `one delete confirmation produced ${deleteRequestCount} DELETE requests`,
            );
          }
          return { deleteRequestCount, disabled, spinnerCount };
        },
      );
    } finally {
      releaseDelete.resolve();
      await browser.page.waitForTimeout(500);
    }

    return {
      details: {
        targetTableId,
        fallbackTableId,
        routing,
        deleteRequestCount: probe.deleteRequestCount,
        confirmDisabledWhilePending: probe.disabled,
        loadingIndicatorCount: probe.spinnerCount,
        deleteUrls,
      },
    };
  } finally {
    await browser?.close().catch(() => undefined);
    for (const tableId of [targetTableId, fallbackTableId]) {
      if (!tableId) continue;
      await permanentDeleteTable(baseId, tableId).catch((error: unknown) => {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }
};
