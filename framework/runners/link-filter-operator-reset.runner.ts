import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  deleteField,
  permanentDeleteTable,
  updateRecordByApi,
  updateViewFilter,
} from "../../../utils/init-app";
import { openBrowserPage, type BrowserLocator } from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { LinkFilterOperatorResetCaseConfig } from "../types";

const FOREIGN_TITLE = "Linked record";
const HOST_TITLE = "Issue";
const LINK_FIELD = "Related record";

const waitForLocator = async (
  locator: BrowserLocator,
  timeoutMs: number,
  message: string,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await locator.count()) > 0 && (await locator.isVisible()))
      return locator;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
};

const recordIds = (records: { id: string }[]) =>
  records.map((record) => record.id);

export const runLinkFilterOperatorResetCase = async (
  bugCase: BugCaseFor<"link-filter-operator-reset">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LinkFilterOperatorResetCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let foreignTableId = "";
  let hostTableId = "";
  let linkFieldId = "";
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;

  try {
    const foreignTable = await createTable(baseId, {
      name: `${suffix}-linked-records`,
      fields: [{ name: FOREIGN_TITLE, type: FieldType.SingleLineText }],
      records: [
        { fields: { [FOREIGN_TITLE]: config.matchingTitle } },
        { fields: { [FOREIGN_TITLE]: config.otherTitle } },
      ],
    });
    foreignTableId = foreignTable.id;
    const matchingForeignId = foreignTable.records[0]?.id;
    const otherForeignId = foreignTable.records[1]?.id;
    if (!matchingForeignId || !otherForeignId) {
      throw new Error("the linked-record fixture did not create both records");
    }

    const hostTable = await createTable(baseId, {
      name: `${suffix}-issues`,
      fields: [{ name: HOST_TITLE, type: FieldType.SingleLineText }],
      records: [
        { fields: { [HOST_TITLE]: "matching issue" } },
        { fields: { [HOST_TITLE]: "other issue" } },
      ],
    });
    hostTableId = hostTable.id;
    const matchingHostId = hostTable.records[0]?.id;
    const otherHostId = hostTable.records[1]?.id;
    const viewId = hostTable.views[0]?.id;
    if (!matchingHostId || !otherHostId || !viewId) {
      throw new Error(
        "the host fixture did not create both records and a view",
      );
    }

    const linkField = await createField(hostTableId, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        foreignTableId,
        relationship: Relationship.ManyOne,
        isOneWay: true,
      },
    });
    linkFieldId = linkField.id;
    await updateRecordByApi(hostTableId, matchingHostId, linkFieldId, {
      id: matchingForeignId,
    });
    await updateRecordByApi(hostTableId, otherHostId, linkFieldId, {
      id: otherForeignId,
    });

    await updateViewFilter(hostTableId, viewId, {
      filter: {
        conjunction: "and",
        filterSet: [
          { fieldId: linkFieldId, operator: "is", value: matchingForeignId },
        ],
      },
    });
    const fixtureRead = await apiGetRecords(hostTableId, {
      fieldKeyType: FieldKeyType.Id,
      viewId,
      take: 10,
    });
    const fixtureRouting = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    const fixtureIds = recordIds(fixtureRead.data.records);
    if (fixtureIds.join(",") !== matchingHostId) {
      throw new Error(
        `the initial link filter returned [${fixtureIds.join(", ")}], expected only ${matchingHostId}`,
      );
    }

    browser = await openBrowserPage(context, { locale: "zh" });
    await browser.page.goto(
      `${browser.frontendUrl}/base/${baseId}/table/${hostTableId}/${viewId}`,
      { waitUntil: "domcontentloaded", timeout: 120_000 },
    );

    const filterButton = browser.page.locator(
      'button:has(svg path[d^="M22 3H2l8 9.46"])',
    );
    await waitForLocator(
      filterButton,
      config.settleTimeoutMs,
      "the grid filter button did not render",
    );
    await filterButton.click();

    const condition = browser.page
      .locator("[data-filter-condition-item]")
      .last();
    await waitForLocator(
      condition,
      config.settleTimeoutMs,
      "the saved link condition did not render in the filter panel",
    );
    const operatorButton = condition.locator('button[role="combobox"]').nth(1);
    if ((await operatorButton.count()) !== 1) {
      throw new Error("the saved link condition has no operator control");
    }

    let resultHeaders: Record<string, unknown> | undefined;
    const probe = await bugCheckpoint(
      "link-is-to-contains-clears-record-id-and-filters-by-title",
      async () => {
        await operatorButton.click();
        const containsOption = browser!.page
          .locator('[cmdk-item][data-value="contains"]')
          .last();
        await waitForLocator(
          containsOption,
          config.settleTimeoutMs,
          "the contains operator was not available for the link field",
        );
        await containsOption.click();

        const titleInput = condition.locator("input").last();
        await waitForLocator(
          titleInput,
          config.settleTimeoutMs,
          "switching the link filter to contains did not render a title input",
        );
        const valueAfterSwitch = await titleInput.inputValue();
        if (valueAfterSwitch !== "") {
          throw new Error(
            `switching from is to contains displayed stale value ${JSON.stringify(valueAfterSwitch)}; expected an empty title input, never record id ${matchingForeignId}`,
          );
        }

        const saved = browser!.page.waitForResponse(
          (response) =>
            response.request().method() === "PUT" &&
            new URL(response.url()).pathname ===
              `/api/table/${hostTableId}/view/${viewId}/filter`,
          { timeout: config.settleTimeoutMs },
        );
        await titleInput.fill(config.matchingTitle);
        const saveResponse = await saved;
        if (saveResponse.status() !== 200) {
          throw new Error(
            `saving the contains filter answered ${saveResponse.status()}, expected 200`,
          );
        }
        if ((await titleInput.inputValue()) !== config.matchingTitle) {
          throw new Error(
            "the visible filter value did not retain the linked record title",
          );
        }
        if ((await titleInput.inputValue()).startsWith("rec")) {
          throw new Error(
            "the visible contains value is a record id instead of a title",
          );
        }

        const filtered = await apiGetRecords(hostTableId, {
          fieldKeyType: FieldKeyType.Id,
          viewId,
          take: 10,
        });
        resultHeaders = filtered.headers;
        const filteredIds = recordIds(filtered.data.records);
        if (filteredIds.join(",") !== matchingHostId) {
          throw new Error(
            `the title filter returned [${filteredIds.join(", ")}], expected only ${matchingHostId}`,
          );
        }
        return { valueAfterSwitch, filteredIds };
      },
    );
    const resultRouting = assertServedByV2(resultHeaders ?? {}, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    return {
      details: {
        hostTableId,
        foreignTableId,
        linkFieldId,
        matchingForeignId,
        valueAfterSwitch: probe.valueAfterSwitch,
        filteredRecordIds: probe.filteredIds,
        fixtureRouting,
        resultRouting,
      },
    };
  } finally {
    await browser?.close().catch(() => undefined);
    if (linkFieldId && hostTableId) {
      await deleteField(hostTableId, linkFieldId).catch(() => undefined);
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
