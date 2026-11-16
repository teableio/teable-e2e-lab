import { FieldKeyType, FieldType, ViewType } from "@teable/core";
import {
  convertField,
  createView,
  getFields,
  getRecords,
  getView,
  updateViewFilter,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import {
  openBrowserPage,
  sanitizeBrowserDiagnosticText,
  type BrowserPage,
} from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import { normalizeBugError, type NormalizedBugError } from "../bug-error";
import { BugPresentError, type BugCaseFor, type BugRunContext } from "../types";

type Filter = {
  conjunction: "and";
  filterSet: { fieldId: string; operator: string; value: string[] }[];
};

const same = (actual: unknown, expected: unknown, label: string) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
};

const people = (value: unknown): string[] => {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value])
    .map((person) => {
      if (!person || typeof person !== "object" || !("id" in person)) {
        throw new Error(`invalid user value ${JSON.stringify(value)}`);
      }
      return String(person.id);
    })
    .sort();
};

const waitFor = async (check: () => Promise<void>, timeout: number) => {
  const deadline = Date.now() + timeout;
  let last: unknown;
  do {
    try {
      await check();
      return;
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  } while (Date.now() < deadline);
  throw last;
};

const canvasPeople = async (page: BrowserPage, name: string) => {
  const entries = await page.evaluate<{ text: string; x: number; y: number }[]>(
    "Array.from(globalThis.__e2eLabCanvasText ?? [])",
  );
  return [
    ...new Set(
      entries
        .filter((entry) => entry.text === name)
        .map((entry) => `${entry.x}:${entry.y}`),
    ),
  ].length;
};

const checkDetails = async (page: BrowserPage, name: string, phase: string) => {
  for (const label of ["Owner", "Control"]) {
    const item = page
      .locator(`div.relative.group\\/field-row:has-text("${label}")`)
      .last();
    const text = await item.textContent();
    if (!text?.includes(name))
      throw new Error(
        `${phase} record detail ${label}: ${JSON.stringify(text)}`,
      );
  }
};

export const runUserModeSwitchCase = async (
  bugCase: BugCaseFor<"user-mode-switch">,
  context: BugRunContext,
) => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const user = {
    id: globalThis.testConfig.userId,
    title: globalThis.testConfig.userName,
  };
  const tables: string[] = [];
  const browsers = new Map<
    string,
    Awaited<ReturnType<typeof openBrowserPage>>
  >();
  const secrets = (Array.isArray(context.cookie) ? context.cookie : [context.cookie])
    .flatMap((cookie) => cookie?.split(";") ?? [])
    .map((cookie) => cookie.slice(cookie.indexOf("=") + 1).trim())
    .filter(Boolean);
  const safe = (text: string, limit = 8_192) =>
    sanitizeBrowserDiagnosticText(text, secrets).slice(0, limit);
  const bounded = <T>(entries: T[], entry: T) => {
    entries.push(entry);
    if (entries.length > 100) entries.shift();
  };
  const stages: {
    time: string;
    tableId?: string;
    direction: string;
    phase: string;
  }[] = [];
  const phases = new Map<string, string>();
  const stage = (tableId: string | undefined, direction: string, phase: string) => {
    if (tableId) phases.set(tableId, phase);
    bounded(stages, { time: new Date().toISOString(), tableId, direction, phase });
  };
  type PageContext = {
    time: string;
    tableId: string;
    direction: string;
    pageRole: "grid" | "detail";
    phase: string;
  };
  const pageErrors: (PageContext & {
    name: string;
    message: string;
    stack?: string;
  })[] = [];
  const failedRequests: (PageContext & {
    kind: "http" | "network";
    method: string;
    url: string;
    status?: number;
    failure?: string;
    correlation: Record<string, string>;
  })[] = [];
  const attachDiagnostics = (
    page: BrowserPage,
    tableId: string,
    direction: string,
    pageRole: PageContext["pageRole"],
  ) => {
    const pageContext = (): PageContext => ({
      time: new Date().toISOString(),
      tableId,
      direction,
      pageRole,
      phase: phases.get(tableId) ?? "setup",
    });
    page.on("pageerror", (error) => {
      bounded(pageErrors, {
        ...pageContext(),
        name: safe(error.name, 256),
        message: safe(error.message),
        stack: error.stack ? safe(error.stack) : undefined,
      });
    });
    const correlations = (
      source: { headerValue(name: string): Promise<string | null> },
      entry: (typeof failedRequests)[number],
      sourceRole: "request" | "response",
    ) => {
      // Ask only for correlation headers, never allHeaders(), cookies or auth.
      for (const name of ["x-request-id", "request-id", "traceparent"]) {
        void source.headerValue(name)
          .then((value) => {
            if (value) entry.correlation[`${sourceRole}.${name}`] = safe(value, 256);
          })
          .catch(() => undefined);
      }
    };
    const requestUrl = (raw: string) => {
      try {
        const url = new URL(raw);
        return safe(`${url.origin}${url.pathname}`, 2_048);
      } catch {
        return "<REDACTED_URL>";
      }
    };
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const entry: (typeof failedRequests)[number] = {
        ...pageContext(),
        kind: "http",
        method: response.request().method(),
        url: requestUrl(response.url()),
        status: response.status(),
        correlation: {},
      };
      bounded(failedRequests, entry);
      correlations(response, entry, "response");
      correlations(response.request(), entry, "request");
    });
    page.on("requestfailed", (request) => {
      const entry: (typeof failedRequests)[number] = {
        ...pageContext(),
        kind: "network",
        method: request.method(),
        url: requestUrl(request.url()),
        failure: safe(request.failure()?.errorText ?? "unknown network failure"),
        correlation: {},
      };
      bounded(failedRequests, entry);
      correlations(request, entry, "request");
    });
  };
  const diagnostics = () => ({
    stages,
    pageErrors,
    failedRequests,
    frontendOutput: browsers.values().next().value?.frontendOutput() ?? "",
  });
  const fieldUpdates = new Set<string>();
  const fixtures = [];

  try {
    // Separate tables make both directions observable even if the first fails.
    for (const multiple of [false, true]) {
      const direction = multiple ? "many-to-one" : "one-to-many";
      stage(undefined, direction, "setup:create-fixture");
      const table = await createTable(baseId, {
        name: `${config.tableNamePrefix}-${multiple ? "many" : "one"}-${context.runId}`,
        fields: [
          { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
          {
            name: "Owner",
            type: FieldType.User,
            options: { isMultiple: multiple, shouldNotify: false },
          },
          {
            name: "Control",
            type: FieldType.User,
            options: { isMultiple: false, shouldNotify: false },
          },
        ],
        records: [
          {
            fields: {
              Name: "first",
              Owner: multiple ? [user] : user,
              Control: user,
            },
          },
          {
            fields: {
              Name: "second",
              Owner: multiple ? [user] : user,
              Control: user,
            },
          },
          { fields: { Name: "empty", Control: user } },
        ],
      });
      tables.push(table.id);
      stage(table.id, direction, "setup:read-values");
      const owner = table.fields.find((field) => field.name === "Owner")!;
      const control = table.fields.find((field) => field.name === "Control")!;
      if (!owner || !control || table.records.length !== 3)
        throw new Error("incomplete user fixture");
      const matchedIds = table.records
        .slice(0, 2)
        .map((row) => row.id)
        .sort();
      const expectedIds = table.records.map((row) => row.id).sort();
      const readValues = async () => {
        const response = await getRecords(table.id, {
          fieldKeyType: FieldKeyType.Id,
          take: 10,
        });
        same(
          response.data.records.map((row) => row.id).sort(),
          expectedIds,
          "unfiltered rows",
        );
        for (const row of response.data.records) {
          same(
            people(row.fields[owner.id]),
            matchedIds.includes(row.id) ? [user.id] : [],
            `Owner ${row.id}`,
          );
          same(people(row.fields[control.id]), [user.id], `Control ${row.id}`);
        }
        return response;
      };
      const before = await readValues();
      assertServedByV2(before.headers, {
        operation: "GET /table/{tableId}/record",
        feature: "getRecords",
      });
      // Prove the actual conversion route on the fixture without changing mode yet.
      stage(table.id, direction, "setup:warm-conversion");
      const warmup = await convertField(table.id, owner.id, {
        name: "Owner",
        type: FieldType.User,
        options: { isMultiple: multiple, shouldNotify: false },
      });
      assertServedByV2(warmup.headers, {
        operation: "PUT /table/{tableId}/field/{fieldId}/convert",
        feature: "convertField",
      });
      const views = [];
      if (config.observation === "filters") {
        stage(table.id, direction, "setup:filters");
        for (const negative of [false, true]) {
          const operator = multiple
            ? negative
              ? "hasNoneOf"
              : "hasAnyOf"
            : negative
              ? "isNoneOf"
              : "isAnyOf";
          const filter: Filter = {
            conjunction: "and",
            filterSet: [
              {
                fieldId: owner.id,
                operator,
                value: [multiple ? "Me" : user.id],
              },
            ],
          };
          const view = (
            await createView(table.id, {
              name: negative ? "Other rows" : "My rows",
              type: ViewType.Grid,
            })
          ).data;
          await updateViewFilter(table.id, view.id, { filter });
          const initial = await getRecords(table.id, {
            viewId: view.id,
            fieldKeyType: FieldKeyType.Id,
            take: 10,
          });
          const ids = negative
            ? expectedIds.filter((id) => !matchedIds.includes(id))
            : matchedIds;
          same(
            initial.data.records.map((row) => row.id).sort(),
            ids,
            `initial ${operator}`,
          );
          views.push({ id: view.id, filter, ids, negative });
        }
      }
      fixtures.push({ table, owner, multiple, readValues, views });
    }

    if (config.observation === "values") {
      for (const { table, owner, multiple } of fixtures) {
        const direction = multiple ? "many-to-one" : "one-to-many";
        stage(table.id, direction, "setup:open-grid");
        const browser = await openBrowserPage(context, {
          captureCanvasText: true,
        });
        browsers.set(table.id, browser);
        attachDiagnostics(browser.page, table.id, direction, "grid");
        browser.page.on("websocket", (socket) => {
          socket.on("framereceived", (frame) => {
            const raw =
              typeof frame.payload === "string"
                ? frame.payload
                : frame.payload.toString("utf8");
            if (!raw.startsWith("a[")) return;
            try {
              for (const message of JSON.parse(raw.slice(1))) {
                const data =
                  typeof message === "string" ? JSON.parse(message) : message;
                if (
                  data.a === "op" &&
                  data.d === owner.id &&
                  Array.isArray(data.op) &&
                  data.op.some(
                    (op: { p?: unknown[]; oi?: { isMultiple?: boolean } }) =>
                      op.p?.[0] === "options" &&
                      op.oi?.isMultiple === !multiple,
                  )
                ) {
                  fieldUpdates.add(table.id);
                }
              }
            } catch {
              /* Non-document frames are not conversion evidence. */
            }
          });
        });
        stage(table.id, direction, "setup:grid-navigation");
        await browser.page.goto(
          `${browser.frontendUrl}/base/${baseId}/table/${table.id}/${table.defaultViewId}`,
          { waitUntil: "domcontentloaded", timeout: 180_000 },
        );
        stage(table.id, direction, "setup:grid-values");
        await waitFor(async () => {
          same(
            await canvasPeople(browser.page, user.title),
            5,
            "initial grid user cells",
          );
        }, config.settleTimeoutMs);
        stage(table.id, direction, "setup:open-detail");
        const detail = await openBrowserPage(context);
        browsers.set(`${table.id}:detail`, detail);
        attachDiagnostics(detail.page, table.id, direction, "detail");
        stage(table.id, direction, "setup:detail-navigation");
        await detail.page.goto(
          `${detail.frontendUrl}/base/${baseId}/table/${table.id}/${table.defaultViewId}?recordId=${table.records[0].id}`,
          { waitUntil: "domcontentloaded", timeout: 180_000 },
        );
        stage(table.id, direction, "setup:detail-values");
        await waitFor(
          () => checkDetails(detail.page, user.title, "initial"),
          config.settleTimeoutMs,
        );
      }
    }
    const failures: string[] = [];
    const evidence: unknown[] = [];
    const directionFailures: {
      direction: string;
      tableId: string;
      phase?: string;
      error: NormalizedBugError;
    }[] = [];
    const probe = await bugCheckpoint(
      "user-mode-switch-preserves-its-existing-data",
      async () => {
        for (const fixture of fixtures) {
          const { table, owner, multiple, readValues, views } = fixture;
          const browser = browsers.get(table.id);
          const direction = multiple ? "many-to-one" : "one-to-many";
          try {
            const gridUrl = browser
              ? `${browser.frontendUrl}/base/${baseId}/table/${table.id}/${table.defaultViewId}`
              : "";
            if (browser) {
              stage(table.id, direction, "conversion:clear-grid-paint");
              fieldUpdates.delete(table.id);
              // Discard previous paint calls so the old picture cannot satisfy the assertion.
              await browser.page.evaluate(
                "globalThis.__e2eLabCanvasText.splice(0)",
              );
            }
            stage(table.id, direction, "conversion:request");
            await convertField(table.id, owner.id, {
              name: "Owner",
              type: FieldType.User,
              options: { isMultiple: !multiple, shouldNotify: false },
            });
            stage(table.id, direction, "conversion:metadata");
            const fields = (await getFields(table.id)).data;
            same(
              (
                fields.find((field) => field.id === owner.id)?.options as {
                  isMultiple?: boolean;
                }
              )?.isMultiple,
              !multiple,
              `${direction} options`,
            );
            stage(table.id, direction, "conversion:values");
            await readValues();
            if (browser) {
              stage(table.id, direction, "conversion:websocket");
              await waitFor(async () => {
                if (!fieldUpdates.has(table.id))
                  throw new Error(
                    `${direction}: the open grid received no field-mode update`,
                  );
              }, config.settleTimeoutMs);
              const detail = browsers.get(`${table.id}:detail`)!;
              stage(table.id, direction, "conversion:live-detail");
              await waitFor(
                () =>
                  checkDetails(detail.page, user.title, `${direction} live`),
                config.settleTimeoutMs,
              );
              stage(table.id, direction, "conversion:live-grid");
              await waitFor(async () => {
                same(
                  await canvasPeople(browser!.page, user.title),
                  5,
                  `${direction} live grid user cells`,
                );
              }, config.settleTimeoutMs);
              stage(table.id, direction, "conversion:grid-reload");
              await browser.page.goto(gridUrl, {
                waitUntil: "domcontentloaded",
                timeout: 180_000,
              });
              stage(table.id, direction, "conversion:reloaded-grid-values");
              await waitFor(async () => {
                same(
                  await canvasPeople(browser!.page, user.title),
                  5,
                  `${direction} refreshed grid user cells`,
                );
              }, config.settleTimeoutMs);
              stage(table.id, direction, "conversion:detail-navigation");
              await browser.page.goto(
                `${gridUrl}?recordId=${table.records[0].id}`,
                { waitUntil: "domcontentloaded", timeout: 180_000 },
              );
              stage(table.id, direction, "conversion:navigated-detail-values");
              await waitFor(async () => {
                for (const label of ["Owner", "Control"]) {
                  const item = browser!.page
                    .locator(
                      `div.relative.group\\/field-row:has-text("${label}")`,
                    )
                    .last();
                  const text = await item.textContent();
                  if (!text?.includes(user.title))
                    throw new Error(
                      `${direction} record detail ${label}: ${JSON.stringify(text)}`,
                    );
                }
              }, config.settleTimeoutMs);
            }
            for (const view of views) {
              stage(table.id, direction, "conversion:filters");
              const saved = (await getView(table.id, view.id)).data
                .filter as Filter;
              const expectedOperator = !multiple
                ? view.negative
                  ? "hasNoneOf"
                  : "hasAnyOf"
                : view.negative
                  ? "isNoneOf"
                  : "isAnyOf";
              same(
                saved?.filterSet?.map((item) => [
                  item.fieldId,
                  item.operator,
                  item.value,
                ]),
                [[owner.id, expectedOperator, view.filter.filterSet[0].value]],
                `${direction} persisted filter`,
              );
              // An open grid can still send its pre-conversion filter. A refresh reads the saved one.
              for (const filter of [undefined, saved, view.filter]) {
                const response = await getRecords(table.id, {
                  viewId: view.id,
                  fieldKeyType: FieldKeyType.Id,
                  take: 10,
                  ...(filter ? { filter } : {}),
                });
                same(
                  response.data.records.map((row) => row.id).sort(),
                  view.ids,
                  `${direction} ${JSON.stringify(filter ?? "saved view")}`,
                );
              }
              evidence.push({
                direction,
                viewId: view.id,
                saved,
                expectedIds: view.ids,
              });
            }
            evidence.push({ direction, valuesPreserved: true });
            stage(table.id, direction, "complete");
          } catch (error) {
            const normalized = normalizeBugError(error);
            const diagnosticError = {
              ...normalized,
              name: normalized.name ? safe(normalized.name, 256) : undefined,
              message: safe(normalized.message),
              stack: normalized.stack ? safe(normalized.stack) : undefined,
              response: normalized.response ? safe(normalized.response) : undefined,
            };
            directionFailures.push({
              direction,
              tableId: table.id,
              phase: phases.get(table.id),
              error: diagnosticError,
            });
            failures.push(
              `${direction}: ${diagnosticError.message}; response=${JSON.stringify(diagnosticError.response)}`,
            );
          }
        }
        if (pageErrors.length)
          failures.push(
            `browser errors: ${pageErrors.map((error) => error.message).join(" | ")}`,
          );
        if (failures.length) {
          throw new BugPresentError(failures.join("\n"), {
            checkpoint: "user-mode-switch-preserves-its-existing-data",
            evidence: { evidence, directionFailures, ...diagnostics() },
          });
        }
        return { evidence, ...diagnostics() };
      },
    );
    return { details: { tableIds: tables, ...probe } };
  } catch (error) {
    if (error instanceof BugPresentError) throw error;
    // Setup errors stay outside the checkpoint and retain their error verdict.
    const normalized = normalizeBugError(error);
    const diagnosticText = JSON.stringify(diagnostics());
    const failure = new Error(
      `${safe(normalized.message)}\nBrowser diagnostics: ${diagnosticText}`,
      {
        cause: {
          response: {
            status: normalized.status,
            data: normalized.response ? safe(normalized.response) : undefined,
          },
        },
      },
    );
    failure.name = normalized.name ? safe(normalized.name, 256) : "Error";
    failure.stack = `${safe(normalized.stack ?? normalized.message)}\nBrowser diagnostics: ${diagnosticText}`;
    throw failure;
  } finally {
    for (const browser of browsers.values())
      await browser.close().catch(() => undefined);
    for (const tableId of tables)
      await permanentDeleteTable(baseId, tableId).catch((error) => {
        console.warn(`[e2e-lab] cleanup ${tableId}: ${safe(String(error))}`);
      });
  }
};
