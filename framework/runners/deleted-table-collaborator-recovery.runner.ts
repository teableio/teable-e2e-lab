import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  DELETE_TABLE,
  getRecords as apiGetRecords,
  getTableList,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { openBrowserPage } from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DeletedTableCollaboratorRecoveryCaseConfig } from "../types";

const TITLE_FIELD = "Name";

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

export const runDeletedTableCollaboratorRecoveryCase = async (
  bugCase: BugCaseFor<"deleted-table-collaborator-recovery">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DeletedTableCollaboratorRecoveryCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let targetTableId = "";
  let fallbackTableId = "";
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;

  try {
    const fallbackTable = await createTable(baseId, {
      name: `${suffix}-fallback`,
      fields: [{ name: TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [TITLE_FIELD]: "safe destination" } }],
    });
    fallbackTableId = fallbackTable.id;

    const targetTable = await createTable(baseId, {
      name: `${suffix}-target`,
      fields: [{ name: TITLE_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [TITLE_FIELD]: "open collaborator row" } }],
    });
    targetTableId = targetTable.id;
    const targetViewId = targetTable.views[0]?.id;
    if (!targetViewId) {
      throw new Error(`target table ${targetTableId} has no default view`);
    }

    const fixtureRead = await apiGetRecords(targetTableId, {
      fieldKeyType: FieldKeyType.Id,
      take: 10,
    });
    const fixtureRouting = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (fixtureRead.data.records.length !== 1) {
      throw new Error(
        "the target table fixture is not readable before deletion",
      );
    }

    browser = await openBrowserPage(context);
    const pageErrors: string[] = [];
    const targetRequests: string[] = [];
    browser.page.on("pageerror", (error) => pageErrors.push(error.message));
    browser.page.on("request", (request) => {
      if (decodeURIComponent(request.url()).includes(targetTableId)) {
        targetRequests.push(request.url());
      }
    });
    await browser.page.goto(
      `${browser.frontendUrl}/base/${baseId}/table/${targetTableId}/${targetViewId}`,
      { waitUntil: "domcontentloaded", timeout: 120_000 },
    );
    await waitUntil(
      async () =>
        browser!.page.url().includes(`/table/${targetTableId}`) &&
        (await browser!.page.locator('[data-t-grid-stage="true"]').count()) > 0,
      config.settleTimeoutMs,
      "the passive collaborator page did not finish opening the target table",
    );

    let deleteHeaders: Record<string, unknown> | undefined;
    const probe = await bugCheckpoint(
      "collaborator-recovers-from-deleted-table",
      async () => {
        const deleted = await axios.delete(
          urlBuilder(DELETE_TABLE, { baseId, tableId: targetTableId }),
          { validateStatus: () => true },
        );
        deleteHeaders = deleted.headers;
        if (deleted.status !== 200) {
          throw new Error(
            `deleting the collaborator's open table answered ${deleted.status}: ${JSON.stringify(deleted.data)}`,
          );
        }

        await waitUntil(
          async () =>
            browser!.page.url().includes(`/table/${fallbackTableId}`) &&
            !browser!.page.url().includes(`/table/${targetTableId}`),
          config.settleTimeoutMs,
          `the collaborator remained on deleted table ${targetTableId}; current URL is ${browser!.page.url()}`,
        );

        const tables = (await getTableList(baseId)).data;
        if (tables.some((table) => table.id === targetTableId)) {
          throw new Error(
            "the deleted target still appears in the public table list",
          );
        }
        if (!tables.some((table) => table.id === fallbackTableId)) {
          throw new Error(
            "the recovery destination disappeared from the public table list",
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, config.quietPeriodMs),
        );
        const requestsAtRest = targetRequests.length;
        await new Promise((resolve) =>
          setTimeout(resolve, config.quietPeriodMs),
        );
        if (targetRequests.length !== requestsAtRest) {
          throw new Error(
            `the recovered page kept issuing requests for deleted table ${targetTableId}`,
          );
        }
        if (pageErrors.length > 0) {
          throw new Error(
            `the collaborator page raised unhandled errors: ${pageErrors.join(" | ")}`,
          );
        }

        return {
          recoveredUrl: browser!.page.url(),
          requestsAtRest,
        };
      },
    );
    const deleteRouting = assertServedByV2(deleteHeaders ?? {}, {
      operation: "DELETE /base/{baseId}/table/{tableId}",
      feature: "deleteTable",
    });

    return {
      details: {
        targetTableId,
        fallbackTableId,
        recoveredUrl: probe.recoveredUrl,
        deletedTableRequestsBeforeQuietPeriod: probe.requestsAtRest,
        fixtureRouting,
        deleteRouting,
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
