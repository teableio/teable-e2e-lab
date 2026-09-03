import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { openBrowserPage } from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

type CanvasEvidence = {
  textCount: number;
  unexpectedTextCount: number;
  selectedRowChecks: number;
  strokes: { stroke: string; lineWidth: number; pointCount: number }[];
};

const waitUntil = async (
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  message: string,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
};

const linkIds = (value: unknown) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((entry) => (entry as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string");
};

export const runLinkPickerTabSelectionBrowserCase = async (
  bugCase: BugCaseFor<"link-picker-tab-selection-browser">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;

  if (config.otherRowNames.length < 1) {
    throw new Error("the picker needs an unselected row as a control");
  }
  if (config.switchCount < 2) {
    throw new Error("the picker must switch tabs repeatedly");
  }

  try {
    const foreign = await createTable(baseId, {
      name: `${suffix}-foreign`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [
        config.otherRowNames[0],
        config.selectedRowName,
        ...config.otherRowNames.slice(1),
      ].map((name) => ({
        fields: { Name: name },
      })),
    });
    tableIds.unshift(foreign.id);
    const selectedRecord = foreign.records[1];
    if (!selectedRecord) throw new Error("the selected foreign row is missing");

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.unshift(host.id);
    const link = await createField(host.id, {
      name: "Targets",
      type: FieldType.Link,
      options: {
        relationship: Relationship.OneMany,
        foreignTableId: foreign.id,
      },
    });
    const made = await createRecords(host.id, {
      fieldKeyType: FieldKeyType.Name,
      records: [
        {
          fields: {
            Name: "host-row",
            Targets: [{ id: selectedRecord.id }],
          },
        },
      ],
    });
    const hostRecord = made.records[0];
    const viewId = host.defaultViewId;
    if (!hostRecord || !viewId)
      throw new Error("the host fixture is incomplete");

    const fixtureRead = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 5,
    });
    const routing = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const saved = fixtureRead.data.records.find(
      (record: { id: string }) => record.id === hostRecord.id,
    );
    if (linkIds(saved?.fields[link.id]).join(",") !== selectedRecord.id) {
      throw new Error(
        "the saved link was not in place before the picker opened",
      );
    }

    browser = await openBrowserPage(context, {
      captureCanvasText: true,
      captureCanvasStrokes: true,
    });
    await browser.page.route(
      `**/api/table/${foreign.id}/record**`,
      async (route) => {
        const response = await route.fetch();
        const isSelectedQuery = route
          .request()
          .url()
          .includes("filterLinkCellSelected");
        await new Promise((resolve) =>
          setTimeout(resolve, isSelectedQuery ? 300 : 50),
        );
        await route.fulfill({ response });
      },
    );
    const pageErrors: string[] = [];
    browser.page.on("pageerror", (error) => pageErrors.push(error.message));
    await browser.page.goto(
      `${browser.frontendUrl}/base/${baseId}/table/${host.id}/${viewId}?recordId=${hostRecord.id}`,
      { waitUntil: "domcontentloaded", timeout: 180_000 },
    );
    const linkFieldRow = browser.page
      .locator('text="Targets"')
      .locator('xpath=ancestor::div[contains(@class, "group/field-row")][1]');
    const openPickerButton = linkFieldRow.locator(
      'button:has-text("Select record")',
    );
    await waitUntil(
      async () => (await openPickerButton.count()) > 0,
      config.settleTimeoutMs,
      `the linked record editor did not open in the record detail; URL=${browser.page.url()} body=${JSON.stringify(
        await browser.page.locator("body").textContent(),
      )}`,
    );
    await openPickerButton.click();
    await waitUntil(
      async () => (await browser!.page.locator('[role="tab"]').count()) >= 2,
      config.settleTimeoutMs,
      "the link picker did not show its All and Selected tabs",
    );

    const clearCanvasEvidence = () =>
      browser!.page.evaluate<void>(`(() => {
        globalThis.__e2eLabCanvasText?.splice(0);
        globalThis.__e2eLabCanvasStrokes?.splice(0);
      })()`);

    const readCanvasEvidence = () =>
      browser!.page.evaluate<CanvasEvidence>(`(() => {
        const wanted = ${JSON.stringify(config.selectedRowName)};
        const unwanted = new Set(${JSON.stringify(config.otherRowNames)});
        const texts = (globalThis.__e2eLabCanvasText || []).filter(
          (entry) => entry.text === wanted
        );
        const unexpectedTexts = (globalThis.__e2eLabCanvasText || []).filter(
          (entry) => unwanted.has(entry.text)
        );
        const strokes = globalThis.__e2eLabCanvasStrokes || [];
        const selected = strokes.filter((stroke) => {
          if (String(stroke.stroke).toLowerCase() !== "#ffffff") return false;
          if (Math.abs(stroke.lineWidth - 1.9) > 0.01) return false;
          if (stroke.points.length !== 3) return false;
          const minY = Math.min(...stroke.points.map((point) => point.y));
          const maxY = Math.max(...stroke.points.map((point) => point.y));
          return texts.some((text) =>
            text.canvasWidth === stroke.canvasWidth &&
            text.canvasHeight === stroke.canvasHeight &&
            text.y >= minY - 20 &&
            text.y <= maxY + 20
          );
        });
        return {
          textCount: texts.length,
          unexpectedTextCount: unexpectedTexts.length,
          selectedRowChecks: selected.length,
          strokes: strokes.slice(-50).map((stroke) => ({
            stroke: String(stroke.stroke),
            lineWidth: Number(stroke.lineWidth),
            pointCount: stroke.points.length,
          })),
        };
      })()`);

    const waitForSelectedPaint = async (tabName: string) => {
      let evidence: CanvasEvidence = {
        textCount: 0,
        unexpectedTextCount: 0,
        selectedRowChecks: 0,
        strokes: [],
      };
      await waitUntil(
        async () => {
          evidence = await readCanvasEvidence();
          return evidence.textCount > 0;
        },
        config.settleTimeoutMs,
        `${tabName} did not paint ${config.selectedRowName}; evidence=${JSON.stringify(evidence)}`,
      );
      if (evidence.selectedRowChecks === 0) {
        throw new Error(
          `${tabName} first painted ${config.selectedRowName} without its selected checkbox; evidence=${JSON.stringify(evidence)}`,
        );
      }
      if (tabName === "Selected" && evidence.unexpectedTextCount > 0) {
        throw new Error(
          `Selected first painted stale unselected rows; evidence=${JSON.stringify(evidence)}`,
        );
      }
      return evidence;
    };

    const startCanvasRemovalWatch = () =>
      browser!.page.evaluate<void>(`(() => {
        globalThis.__e2eLabCanvasRemovalCount = 0;
        globalThis.__e2eLabCanvasRemovalObserver?.disconnect();
        const observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            for (const node of mutation.removedNodes) {
              if (!(node instanceof Element)) continue;
              if (node.matches("canvas")) {
                globalThis.__e2eLabCanvasRemovalCount += 1;
              }
              globalThis.__e2eLabCanvasRemovalCount +=
                node.querySelectorAll("canvas").length;
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        globalThis.__e2eLabCanvasRemovalObserver = observer;
      })()`);

    const stopCanvasRemovalWatch = () =>
      browser!.page.evaluate<number>(`(() => {
        globalThis.__e2eLabCanvasRemovalObserver?.disconnect();
        return globalThis.__e2eLabCanvasRemovalCount || 0;
      })()`);

    const probe = await bugCheckpoint(
      "link-picker-keeps-the-saved-row-selected-across-tabs",
      async () => {
        const evidence: {
          round: number;
          tab: string;
          paint: CanvasEvidence;
        }[] = [];
        for (let round = 1; round <= 2; round += 1) {
          await startCanvasRemovalWatch();
          for (let index = 0; index < config.switchCount; index += 1) {
            const tabName = index % 2 === 0 ? "Selected" : "All";
            if (index >= config.switchCount - 2) await clearCanvasEvidence();
            await browser!.page
              .locator('[role="tab"]')
              .nth(tabName === "Selected" ? 1 : 0)
              .click();
            if (index >= config.switchCount - 2) {
              evidence.push({
                round,
                tab: tabName,
                paint: await waitForSelectedPaint(tabName),
              });
            }
          }
          const removedCanvases = await stopCanvasRemovalWatch();
          if (removedCanvases > 0) {
            throw new Error(
              `round ${round} unmounted ${removedCanvases} picker canvas element(s) while switching tabs`,
            );
          }
          if (round === 1) {
            await browser!.page
              .locator('[role="dialog"]')
              .locator('button:has-text("Close")')
              .last()
              .click();
            await waitUntil(
              async () =>
                (await browser!.page.locator('[role="tab"]').count()) === 0,
              config.settleTimeoutMs,
              "the link picker did not close before the second round",
            );
            await openPickerButton.click();
            await waitUntil(
              async () =>
                (await browser!.page.locator('[role="tab"]').count()) >= 2,
              config.settleTimeoutMs,
              "the link picker did not reopen for the second round",
            );
          }
        }
        if (pageErrors.length > 0) {
          throw new Error(
            `the link picker raised errors: ${pageErrors.join(" | ")}`,
          );
        }

        const after = await apiGetRecords(host.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 5,
        });
        const record = after.data.records.find(
          (item: { id: string }) => item.id === hostRecord.id,
        );
        const afterIds = linkIds(record?.fields[link.id]);
        if (afterIds.join(",") !== selectedRecord.id) {
          throw new Error(
            `tab switching changed the saved link to ${JSON.stringify(afterIds)}`,
          );
        }
        return { evidence, afterIds };
      },
    );

    return {
      details: {
        foreignTableId: foreign.id,
        hostTableId: host.id,
        hostRecordId: hostRecord.id,
        routing,
        evidence: probe.evidence,
        afterIds: probe.afterIds,
      },
    };
  } finally {
    await browser?.close().catch(() => undefined);
    for (const tableId of tableIds) {
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
    }
  }
};
