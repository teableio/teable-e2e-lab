import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  deleteField,
  permanentDeleteTable,
  updateRecordByApi,
} from "../../../utils/init-app";
import {
  openBrowserPage,
  type BrowserLocator,
  type BrowserPage,
} from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkSelectorCandidatesCaseConfig } from "../types";

const FOREIGN_TITLE = "Test case";
const HOST_TITLE = "Issue";
const LINK_FIELD = "Test cases";

type RecordResponse = {
  records?: { id?: string; fields?: Record<string, unknown> }[];
};

type RowCountResponse = {
  rowCount?: number;
};

const recordIds = async (response: { json(): Promise<unknown> }) => {
  const body = (await response.json()) as RecordResponse;
  return (body.records ?? [])
    .map((record) => record.id)
    .filter((id): id is string => Boolean(id));
};

const isRecordListResponse = (
  response: { url(): string; request(): { method(): string } },
  linkFieldId: string,
) => {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    url.pathname === `/api/share/${linkFieldId}/view/records`
  );
};

const isRowCountResponse = (
  response: { url(): string; request(): { method(): string } },
  linkFieldId: string,
) => {
  const url = new URL(response.url());
  return (
    response.request().method() === "GET" &&
    url.pathname === `/api/share/${linkFieldId}/view/row-count`
  );
};

const carriesCandidateFilter = (
  responseUrl: string,
  fieldId: string,
  recordId: string,
) => {
  const decoded = decodeURIComponent(new URL(responseUrl).search);
  return (
    decoded.includes("filterLinkCellCandidate") &&
    decoded.includes(fieldId) &&
    decoded.includes(recordId)
  );
};

const waitForTabs = async (page: BrowserPage, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  const tabs = page.locator('[role="tab"]');
  while (Date.now() < deadline) {
    if ((await tabs.count()) >= 2) return tabs;
    await page.waitForTimeout(100);
  }
  throw new Error(
    "the link selector did not open (expected All and Selected tabs)",
  );
};

const waitForSelectedTab = async (
  page: BrowserPage,
  tab: BrowserLocator,
  timeoutMs: number,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await tab.getAttribute("aria-selected")) === "true") return;
    await page.waitForTimeout(50);
  }
  throw new Error("the link selector did not switch to the Selected tab");
};

const largestGridStage = async (page: BrowserPage): Promise<BrowserLocator> => {
  const stages = page.locator('[data-t-grid-stage="true"]');
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const count = await stages.count();
    let winner: { locator: BrowserLocator; area: number } | undefined;
    for (let index = 0; index < count; index += 1) {
      const locator = stages.nth(index);
      const box = await locator.boundingBox();
      const area = box ? box.width * box.height : 0;
      if (!winner || area > winner.area) winner = { locator, area };
    }
    if (winner && winner.area > 10_000) return winner.locator;
    await page.waitForTimeout(100);
  }
  throw new Error("the table grid event stage did not render");
};

const openLinkCell = async (page: BrowserPage) => {
  const stage = await largestGridStage(page);
  const box = await stage.boundingBox();
  if (!box) throw new Error("the table grid event stage has no visible bounds");

  // The fixture has a primary text field followed by the link field, and its
  // target host record is row zero. Try a narrow range of positions because
  // historical revisions used two slightly different default column widths.
  const xPositions = [280, 340, 420].filter((x) => x < box.width - 20);
  for (const x of xPositions) {
    await stage.dblclick({ position: { x, y: 52 } });
    try {
      return await waitForTabs(page, 1_500);
    } catch {
      await page.keyboard.press("Escape");
    }
  }
  throw new Error("could not open the fixture's link cell from the first row");
};

const verifyCandidateGridVisible = async (page: BrowserPage) => {
  const stage = page.locator('[data-t-grid-stage="true"]').last();
  const box = await stage.boundingBox();
  if (!box || box.height < 60) {
    throw new Error(
      "the candidate grid is not visible after its records loaded",
    );
  }
};

export const runLinkSelectorCandidatesCase = async (
  bugCase: BugCaseFor<"link-selector-candidates">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkSelectorCandidatesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let foreignTableId = "";
  let hostTableId = "";
  let linkFieldId = "";
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-test-cases`,
      fields: [{ name: FOREIGN_TITLE, type: FieldType.SingleLineText }],
      records: [
        { fields: { [FOREIGN_TITLE]: config.freeRecordTitle } },
        { fields: { [FOREIGN_TITLE]: config.occupiedRecordTitle } },
      ],
    });
    foreignTableId = foreignTable.id;
    const freeRecordId = foreignTable.records[0]?.id;
    const occupiedRecordId = foreignTable.records[1]?.id;
    if (!freeRecordId || !occupiedRecordId) {
      throw new Error("the foreign test-case records were not created");
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-issues`,
      fields: [{ name: HOST_TITLE, type: FieldType.SingleLineText }],
      // Target Issue B is row zero so the browser can address it without
      // depending on canvas text extraction. Issue A owns the occupied child.
      records: [
        { fields: { [HOST_TITLE]: config.targetIssueTitle } },
        { fields: { [HOST_TITLE]: config.ownerIssueTitle } },
      ],
    });
    hostTableId = hostTable.id;
    const targetIssueId = hostTable.records[0]?.id;
    const ownerIssueId = hostTable.records[1]?.id;
    const viewId = hostTable.views[0]?.id;
    if (!targetIssueId || !ownerIssueId || !viewId) {
      throw new Error(
        "the host issue records and default view were not created",
      );
    }

    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.OneMany,
        isOneWay: true,
      },
    });
    linkFieldId = linkField.id;
    await updateRecordByApi(hostTableId, ownerIssueId, linkFieldId, [
      { id: occupiedRecordId },
    ]);

    const warmup = await apiGetRecords(foreignTableId, {
      fieldKeyType: FieldKeyType.Id,
      filterLinkCellCandidate: [linkFieldId, targetIssueId],
      take: 10,
    });
    const routing = assertServedByV2(warmup.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const warmupIds = warmup.data.records.map(
      (record: { id: string }) => record.id,
    );
    if (
      warmupIds.join(",") !== [freeRecordId].join(",") ||
      warmupIds.includes(occupiedRecordId)
    ) {
      throw new Error(
        `candidate fixture is not in place: got [${warmupIds.join(", ")}], expected only ${freeRecordId}`,
      );
    }

    browser = await openBrowserPage(context);
    await browser.page.goto(
      `${browser.frontendUrl}/base/${baseId}/table/${hostTableId}/${viewId}`,
      { waitUntil: "domcontentloaded", timeout: 120_000 },
    );

    const initialCandidate = browser.page.waitForResponse(
      (response) => isRecordListResponse(response, linkFieldId),
      { timeout: 30_000 },
    );
    void initialCandidate.catch(() => undefined);
    const tabs = await openLinkCell(browser.page);
    const initialResponse = await initialCandidate;

    const probe = await bugCheckpoint(
      config.mode === "initial-load"
        ? "first-open-shows-link-candidates"
        : "candidate-filter-survives-selected-all-switch",
      async () => {
        if (
          !carriesCandidateFilter(
            initialResponse.url(),
            linkFieldId,
            targetIssueId,
          )
        ) {
          throw new Error(
            `the first All request omitted its candidate filter: ${initialResponse.url()}`,
          );
        }
        const initialIds = await recordIds(initialResponse);
        if (
          !initialIds.includes(freeRecordId) ||
          initialIds.includes(occupiedRecordId)
        ) {
          throw new Error(
            `the first All list returned [${initialIds.join(", ")}], expected free ${freeRecordId} and not occupied ${occupiedRecordId}`,
          );
        }

        if (config.mode === "initial-load") {
          await browser!.page.waitForTimeout(250);
          await verifyCandidateGridVisible(browser!.page);
          return { initialIds, switchedCount: undefined };
        }

        const selectedRowCountPromise = browser!.page.waitForResponse(
          (response) =>
            isRowCountResponse(response, linkFieldId) &&
            decodeURIComponent(new URL(response.url()).search).includes(
              "filterLinkCellSelected",
            ),
          { timeout: 30_000 },
        );
        await tabs.nth(1).click();
        await waitForSelectedTab(browser!.page, tabs.nth(1), 5_000);
        await selectedRowCountPromise;

        const allResponsePromise = browser!.page
          .waitForResponse(
            (response) =>
              (isRowCountResponse(response, linkFieldId) ||
                isRecordListResponse(response, linkFieldId)) &&
              !decodeURIComponent(new URL(response.url()).search).includes(
                "filterLinkCellSelected",
              ),
            { timeout: 3_000 },
          )
          .catch(() => undefined);
        await tabs.nth(0).click();
        await waitForSelectedTab(browser!.page, tabs.nth(0), 5_000);
        const allResponse = await allResponsePromise;

        if (allResponse) {
          if (
            !carriesCandidateFilter(
              allResponse.url(),
              linkFieldId,
              targetIssueId,
            )
          ) {
            throw new Error(
              `switching back to All dropped the candidate filter: ${allResponse.url()}`,
            );
          }
          if (isRowCountResponse(allResponse, linkFieldId)) {
            const { rowCount } = (await allResponse.json()) as RowCountResponse;
            if (rowCount !== 1) {
              throw new Error(
                `All after tab switch reported ${String(rowCount)} candidates, expected only the one free record`,
              );
            }
          } else {
            const switchedIds = await recordIds(allResponse);
            if (
              !switchedIds.includes(freeRecordId) ||
              switchedIds.includes(occupiedRecordId)
            ) {
              throw new Error(
                `All after tab switch returned [${switchedIds.join(", ")}], expected free ${freeRecordId} and not occupied ${occupiedRecordId}`,
              );
            }
          }
        } else {
          // The fixed UI may reuse the initial All query because its candidate
          // filter, and therefore its query key, was restored exactly.
          await verifyCandidateGridVisible(browser!.page);
        }
        return { initialIds, switchedCount: 1 };
      },
    );

    return {
      details: {
        hostTableId,
        foreignTableId,
        linkFieldId,
        routing,
        freeRecordId,
        occupiedRecordId,
        initialCandidateIds: probe.initialIds,
        candidateCountAfterTabSwitch: probe.switchedCount,
      },
    };
  } finally {
    await browser?.close().catch(() => undefined);
    if (linkFieldId && hostTableId) {
      await deleteField(hostTableId, linkFieldId).catch((error: unknown) => {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (field ${linkFieldId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
    for (const tableId of [hostTableId, foreignTableId]) {
      if (!tableId) continue;
      await permanentDeleteTable(baseId, tableId).catch((error: unknown) => {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${tableId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  }
};
