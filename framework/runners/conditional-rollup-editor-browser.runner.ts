import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Colors, FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  createRecords as apiCreateRecords,
  getRecords as apiGetRecords,
  updateRecord as apiUpdateRecord,
  uploadAttachment as apiUploadAttachment,
} from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { openBrowserPage, type BrowserPage } from "../browser-runtime";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";

type CanvasTextEntry = {
  text: string;
  x: number;
  y: number;
  canvasWidth: number;
  canvasHeight: number;
};

type MatrixFixture = {
  sourceTableId: string;
  hostTableId: string;
  hostViewId: string;
  editorFieldName: string;
  expected: Record<string, unknown>;
};

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));

const waitUntil = async (
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  message: string,
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error(message);
};

const nestedFilter = (
  sourceIds: Record<string, string>,
  hostMatchKeyId: string,
  nestedRows: 1 | 2 = 2,
) => ({
  conjunction: "and" as const,
  filterSet: [
    {
      fieldId: sourceIds.MatchKey,
      operator: "is",
      value: { type: "field", fieldId: hostMatchKeyId },
    },
    {
      conjunction: "or" as const,
      filterSet: [
        { fieldId: sourceIds.FlagA, operator: "is", value: "no" },
        ...(nestedRows === 2
          ? [{ fieldId: sourceIds.FlagB, operator: "is", value: "yes" }]
          : []),
      ],
    },
  ],
});

const fieldIds = (fields: { name: string; id: string }[]) =>
  Object.fromEntries(fields.map((field) => [field.name, field.id]));

const createHost = async (baseId: string, name: string) => {
  const host = await createTable(baseId, {
    name,
    fields: [
      { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      { name: "MatchKey", type: FieldType.SingleLineText },
    ],
    records: [
      { fields: { Name: "Host A", MatchKey: "A" } },
      { fields: { Name: "Host Z", MatchKey: "Z" } },
    ],
  });
  const matchKeyId = host.fields.find(
    (field: { name: string }) => field.name === "MatchKey",
  )?.id;
  if (!matchKeyId || !host.defaultViewId) {
    throw new Error("the conditional-rollup host is incomplete");
  }
  return { host, matchKeyId };
};

const createSourceMatrix = async (
  baseId: string,
  suffix: string,
  tableIds: string[],
  tempDir: string,
): Promise<MatrixFixture> => {
  const target = await createTable(baseId, {
    name: `${suffix}-targets`,
    fields: [{ name: "Name", type: FieldType.SingleLineText, isPrimary: true }],
    records: [
      { fields: { Name: "Same" } },
      { fields: { Name: "Same" } },
      { fields: { Name: "Excluded" } },
      { fields: { Name: "Wrong key" } },
    ],
  });
  tableIds.unshift(target.id);

  const source = await createTable(baseId, {
    name: `${suffix}-source`,
    fields: [
      { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      { name: "MatchKey", type: FieldType.SingleLineText },
      { name: "FlagA", type: FieldType.SingleLineText },
      { name: "FlagB", type: FieldType.LongText },
      {
        name: "Owner",
        type: FieldType.User,
        options: { isMultiple: false, shouldNotify: false },
      },
      { name: "Files", type: FieldType.Attachment },
      { name: "Input", type: FieldType.Number },
    ],
    records: [],
  });
  tableIds.unshift(source.id);
  const sourceIds = fieldIds(source.fields);
  const targets = await apiGetRecords(target.id, {
    fieldKeyType: FieldKeyType.Id,
    take: 10,
  });
  if (targets.data.records.length !== 4) {
    throw new Error("the linked-record targets are incomplete");
  }

  const linked = await createField(source.id, {
    name: "Linked Value",
    type: FieldType.Link,
    options: {
      relationship: Relationship.ManyOne,
      foreignTableId: target.id,
    },
  });
  const formula = await createField(source.id, {
    name: "Formula Value",
    type: FieldType.Formula,
    options: { expression: `{${sourceIds.Input}} * 2` },
  });
  sourceIds["Linked Value"] = linked.id;
  sourceIds["Formula Value"] = formula.id;

  const person = {
    id: globalThis.testConfig.userId,
    title: globalThis.testConfig.userName,
  };
  const rows = [
    ["included-a", "A", "no", "no", 10],
    ["included-b", "A", "yes", "yes", 20],
    ["excluded", "A", "yes", "no", 500],
    ["wrong-key", "B", "no", "yes", 1000],
  ] as const;
  const made = await apiCreateRecords(source.id, {
    fieldKeyType: FieldKeyType.Id,
    records: rows.map(([name, key, flagA, flagB, input]) => ({
      fields: {
        [sourceIds.Name]: name,
        [sourceIds.MatchKey]: key,
        [sourceIds.FlagA]: flagA,
        [sourceIds.FlagB]: flagB,
        [sourceIds.Owner]: person,
        [sourceIds.Input]: input,
      },
    })),
  });
  if (made.data.records.length !== rows.length) {
    throw new Error("the conditional-rollup source rows are incomplete");
  }
  for (const [index, record] of made.data.records.entries()) {
    await apiUpdateRecord(source.id, record.id, {
      fieldKeyType: FieldKeyType.Id,
      record: {
        fields: {
          [linked.id]: { id: targets.data.records[index].id },
        },
      },
    });
  }

  const filePath = join(tempDir, "same-name.txt");
  await writeFile(filePath, "conditional rollup attachment fixture");
  for (const record of made.data.records.slice(0, 3)) {
    const uploaded = await apiUploadAttachment(
      source.id,
      record.id,
      sourceIds.Files,
      createReadStream(filePath),
      { filename: "same-name.txt" },
    );
    if (uploaded.status !== 201) {
      throw new Error(`attachment upload answered ${uploaded.status}`);
    }
  }

  const { host, matchKeyId } = await createHost(baseId, `${suffix}-host`);
  tableIds.unshift(host.id);
  const fullFilter = nestedFilter(sourceIds, matchKeyId, 2);
  const editorFieldName = "Editor Probe";
  await createField(host.id, {
    name: editorFieldName,
    type: FieldType.ConditionalRollup,
    options: {
      foreignTableId: source.id,
      lookupFieldId: formula.id,
      expression: "sum({values})",
      filter: nestedFilter(sourceIds, matchKeyId, 1),
    },
  });
  const specs = [
    ["User Count", sourceIds.Owner, "countall({values})"],
    ["Attachment Count", sourceIds.Files, "countall({values})"],
    ["Link Values", linked.id, "array_unique({values})"],
    ["Formula Sum", formula.id, "sum({values})"],
  ] as const;
  for (const [name, lookupFieldId, expression] of specs) {
    await createField(host.id, {
      name,
      type: FieldType.ConditionalRollup,
      options: {
        foreignTableId: source.id,
        lookupFieldId,
        expression,
        filter: fullFilter,
      },
    });
  }

  return {
    sourceTableId: source.id,
    hostTableId: host.id,
    hostViewId: host.defaultViewId!,
    editorFieldName,
    expected: {
      "User Count": 2,
      "Attachment Count": 2,
      "Link Values": ["Same", "Same"],
      "Formula Sum": 60,
    },
  };
};

const createLookupMatrix = async (
  baseId: string,
  suffix: string,
  tableIds: string[],
): Promise<MatrixFixture> => {
  const target = await createTable(baseId, {
    name: `${suffix}-targets`,
    fields: [
      { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      { name: "Text Value", type: FieldType.SingleLineText },
      { name: "Number Value", type: FieldType.Number },
      { name: "Date Value", type: FieldType.Date },
      { name: "Flag Value", type: FieldType.Checkbox },
      {
        name: "Tags Value",
        type: FieldType.MultipleSelect,
        options: {
          choices: [
            { id: "red", name: "red", color: Colors.RedBright },
            { id: "blue", name: "blue", color: Colors.BlueBright },
            { id: "green", name: "green", color: Colors.GreenBright },
          ],
        },
      },
    ],
    records: [
      {
        fields: {
          Name: "target-a",
          "Text Value": "alpha",
          "Number Value": 10,
          "Date Value": "2026-09-01",
          "Flag Value": true,
          "Tags Value": ["red", "blue"],
        },
      },
      {
        fields: {
          Name: "target-b",
          "Text Value": "beta",
          "Number Value": 20,
          "Date Value": "2026-09-02",
          "Flag Value": true,
          "Tags Value": ["red", "green"],
        },
      },
      {
        fields: {
          Name: "excluded-target",
          "Text Value": "excluded",
          "Number Value": 500,
          "Date Value": "2026-09-03",
          "Flag Value": true,
          "Tags Value": ["green"],
        },
      },
      {
        fields: {
          Name: "wrong-key-target",
          "Text Value": "wrong",
          "Number Value": 1000,
          "Date Value": "2026-09-04",
          "Flag Value": true,
          "Tags Value": ["blue"],
        },
      },
    ],
  });
  tableIds.unshift(target.id);
  const targetIds = fieldIds(target.fields);

  const source = await createTable(baseId, {
    name: `${suffix}-source`,
    fields: [
      { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
      { name: "MatchKey", type: FieldType.SingleLineText },
      { name: "FlagA", type: FieldType.SingleLineText },
      { name: "FlagB", type: FieldType.LongText },
    ],
    records: [],
  });
  tableIds.unshift(source.id);
  const sourceIds = fieldIds(source.fields);
  const link = await createField(source.id, {
    name: "Target",
    type: FieldType.Link,
    options: {
      relationship: Relationship.ManyOne,
      foreignTableId: target.id,
    },
  });
  sourceIds.Target = link.id;

  const lookupSpecs = [
    ["Lookup Text", "Text Value", FieldType.SingleLineText],
    ["Lookup Number", "Number Value", FieldType.Number],
    ["Lookup Date", "Date Value", FieldType.Date],
    ["Lookup Flag", "Flag Value", FieldType.Checkbox],
    ["Lookup Tags", "Tags Value", FieldType.MultipleSelect],
  ] as const;
  const lookupIds = new Map<string, string>();
  for (const [name, targetName, type] of lookupSpecs) {
    const lookup = await createField(source.id, {
      name,
      type,
      isLookup: true,
      lookupOptions: {
        foreignTableId: target.id,
        linkFieldId: link.id,
        lookupFieldId: targetIds[targetName],
      },
    });
    lookupIds.set(name, lookup.id);
  }

  const targets = await apiGetRecords(target.id, {
    fieldKeyType: FieldKeyType.Id,
    take: 10,
  });
  const sourceRows = [
    ["included-a", "A", "no", "no"],
    ["included-b", "A", "yes", "yes"],
    ["excluded", "A", "yes", "no"],
    ["wrong-key", "B", "no", "yes"],
  ] as const;
  const made = await apiCreateRecords(source.id, {
    fieldKeyType: FieldKeyType.Id,
    records: sourceRows.map(([name, key, flagA, flagB], index) => ({
      fields: {
        [sourceIds.Name]: name,
        [sourceIds.MatchKey]: key,
        [sourceIds.FlagA]: flagA,
        [sourceIds.FlagB]: flagB,
        [link.id]: { id: targets.data.records[index].id },
      },
    })),
  });
  if (made.data.records.length !== sourceRows.length) {
    throw new Error("the lookup source rows are incomplete");
  }

  const { host, matchKeyId } = await createHost(baseId, `${suffix}-host`);
  tableIds.unshift(host.id);
  const fullFilter = nestedFilter(sourceIds, matchKeyId, 2);
  const rollupSpecs = [
    ["Lookup Text Count", "Lookup Text", "countall({values})"],
    ["Lookup Number Sum", "Lookup Number", "sum({values})"],
    ["Lookup Date Count", "Lookup Date", "countall({values})"],
    ["Lookup Flag Count", "Lookup Flag", "countall({values})"],
    ["Lookup Tags", "Lookup Tags", "array_unique({values})"],
  ] as const;
  for (const [name, lookupName, expression] of rollupSpecs) {
    await createField(host.id, {
      name,
      type: FieldType.ConditionalRollup,
      options: {
        foreignTableId: source.id,
        lookupFieldId: lookupIds.get(lookupName)!,
        expression,
        filter: fullFilter,
      },
    });
  }

  return {
    sourceTableId: source.id,
    hostTableId: host.id,
    hostViewId: host.defaultViewId!,
    editorFieldName: "Lookup Text Count",
    expected: {
      "Lookup Text Count": 2,
      "Lookup Number Sum": 30,
      "Lookup Date Count": 2,
      "Lookup Flag Count": 2,
      "Lookup Tags": ["red", "blue", "green"],
    },
  };
};

const openPreparedEditor = async (
  page: BrowserPage,
  frontendUrl: string,
  baseId: string,
  fixture: MatrixFixture,
  timeoutMs: number,
) => {
  await page.goto(
    `${frontendUrl}/base/${baseId}/table/${fixture.hostTableId}/${fixture.hostViewId}`,
    { waitUntil: "domcontentloaded", timeout: 180_000 },
  );
  const stage = page.locator('[data-t-grid-stage="true"], [data-t-grid-stage]');
  await waitUntil(
    async () => (await stage.count()) > 0,
    timeoutMs,
    `the grid did not open; URL=${page.url()} body=${JSON.stringify(await page.locator("body").textContent())}`,
  );

  const stageBox = await stage.boundingBox();
  if (!stageBox) throw new Error("the grid stage has no visible bounds");

  const dialog = page.locator('[role="dialog"]').last();
  const attempted: { x: number; fieldName?: string }[] = [];
  for (let x = 100; x < Math.min(stageBox.width - 20, 1_360); x += 150) {
    await stage.click({ position: { x, y: 18 }, clickCount: 2 });
    await sleep(300);
    if ((await dialog.count()) === 0) continue;
    const fieldName = await page.evaluate<string | undefined>(`(() => {
      const input = document.querySelector('[role="dialog"] input');
      return input instanceof HTMLInputElement ? input.value : undefined;
    })()`);
    attempted.push({ x, fieldName });
    if (fieldName === fixture.editorFieldName) return dialog;

    const cancel = dialog.locator('button:has-text("Cancel")');
    if ((await cancel.count()) > 0) {
      await cancel.click();
      await waitUntil(
        async () => (await dialog.count()) === 0,
        5_000,
        `the ${fieldName ?? "unknown"} field sheet did not close`,
      );
    }
  }
  const painted = await page.evaluate<CanvasTextEntry[]>(`(() =>
    (globalThis.__e2eLabCanvasText || []).filter((entry) => entry.y < 80).slice(-80)
  )()`);
  throw new Error(
    `could not open the ${fixture.editorFieldName} field sheet; attempted=${JSON.stringify(attempted)} painted=${JSON.stringify(painted)} body=${JSON.stringify(await page.locator("body").textContent())}`,
  );
};

const sameValue = (actual: unknown, expected: unknown) => {
  if (!Array.isArray(expected)) return Number(actual ?? 0) === expected;
  if (!Array.isArray(actual)) return false;
  const values = actual.map((item) =>
    typeof item === "string"
      ? item
      : String((item as { title?: unknown }).title ?? item),
  );
  return values.join("\u0000") === expected.join("\u0000");
};

export const runConditionalRollupEditorBrowserCase = async (
  bugCase: BugCaseFor<"conditional-rollup-editor-browser">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const tableIds: string[] = [];
  const tempDir = await mkdtemp(join(tmpdir(), "e2e-lab-rollup-editor-"));
  let browser: Awaited<ReturnType<typeof openBrowserPage>> | undefined;

  const expectedIds =
    config.layout === "group-header" ? "Y479,Y480,Y481,Y482" : "Y483";
  if (config.coveredCaseIds.join(",") !== expectedIds) {
    throw new Error(
      "the case-id matrix no longer matches the implemented source matrix",
    );
  }

  try {
    const fixture =
      config.layout === "group-header"
        ? await createSourceMatrix(baseId, suffix, tableIds, tempDir)
        : await createLookupMatrix(baseId, suffix, tableIds);

    const fixtureRead = await apiGetRecords(fixture.hostTableId, {
      fieldKeyType: FieldKeyType.Name,
      take: 5,
    });
    const routing = assertServedByV2(fixtureRead.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (fixtureRead.data.records.length !== 2) {
      throw new Error("the host fixture does not contain both control rows");
    }

    browser = await openBrowserPage(context, { captureCanvasText: true });
    const pageErrors: string[] = [];
    browser.page.on("pageerror", (error) => pageErrors.push(error.message));

    const probe = await bugCheckpoint(
      "nested-rollup-conditions-remain-editable-in-the-narrow-sheet",
      async () => {
        const dialog = await openPreparedEditor(
          browser!.page,
          browser!.frontendUrl,
          baseId,
          fixture,
          config.settleTimeoutMs,
        );
        const group = dialog.locator("div.rounded-lg.border-input").last();
        const [dialogBox, groupBox] = await Promise.all([
          dialog.boundingBox(),
          group.boundingBox(),
        ]);
        if (!dialogBox || !groupBox) {
          throw new Error(
            `the nested group is not visible; dialog=${JSON.stringify(dialogBox)} group=${JSON.stringify(groupBox)} pageErrors=${JSON.stringify(pageErrors)}`,
          );
        }

        if (config.layout === "condition-rows") {
          const controls = group.locator("[data-filter-condition-controls]");
          const count = await controls.count();
          if (count < 2) {
            throw new Error(
              `the nested OR rendered only ${count} condition rows`,
            );
          }
          for (let index = 0; index < count; index += 1) {
            const box = await controls.nth(index).boundingBox();
            if (
              !box ||
              box.x < groupBox.x ||
              box.x + box.width > groupBox.x + groupBox.width
            ) {
              throw new Error(
                `condition row ${index + 1} overflows the nested group; group=${JSON.stringify(groupBox)} row=${JSON.stringify(box)}`,
              );
            }
          }
        }

        const header = group.locator(":scope > div").nth(0);
        const markedAdd = header.locator(
          'button[data-testid="filter-group-add"]',
        );
        const add =
          (await markedAdd.count()) > 0
            ? markedAdd.nth(0)
            : header.locator("button").nth(1);
        const addBox = (await add.count()) > 0 ? await add.boundingBox() : null;
        if (!addBox) {
          throw new Error(
            `the nested-group add action is not visible; dialog=${JSON.stringify(dialogBox)} group=${JSON.stringify(groupBox)} add=${JSON.stringify(addBox)} pageErrors=${JSON.stringify(pageErrors)}`,
          );
        }
        if (
          addBox.x < dialogBox.x ||
          addBox.x + addBox.width > dialogBox.x + dialogBox.width
        ) {
          throw new Error(
            `the nested-group add action is clipped outside the field sheet; dialog=${JSON.stringify(dialogBox)} add=${JSON.stringify(addBox)}`,
          );
        }

        const beforeCount = await group
          .locator("[data-filter-condition-item]")
          .count();
        await add.click({ timeout: config.settleTimeoutMs });
        const addCondition = browser!.page
          .locator('[role="menuitem"]:has-text("Add condition")')
          .nth(0);
        await addCondition.click({ timeout: config.settleTimeoutMs });
        const afterCount = await group
          .locator("[data-filter-condition-item]")
          .count();
        if (afterCount !== beforeCount + 1) {
          throw new Error(
            `the nested-group action changed its row count from ${beforeCount} to ${afterCount}, expected ${beforeCount + 1}`,
          );
        }

        let hostA: Record<string, unknown> = {};
        let hostZ: Record<string, unknown> = {};
        const deadline = Date.now() + config.settleTimeoutMs;
        for (;;) {
          const read = await apiGetRecords(fixture.hostTableId, {
            fieldKeyType: FieldKeyType.Name,
            take: 5,
          });
          const byName = new Map<string, Record<string, unknown>>(
            read.data.records.map(
              (record: { fields: Record<string, unknown> }) => [
                String(record.fields.Name),
                record.fields,
              ],
            ),
          );
          hostA = byName.get("Host A") ?? {};
          hostZ = byName.get("Host Z") ?? {};
          if (
            Object.entries(fixture.expected).every(([name, expected]) =>
              sameValue(hostA[name], expected),
            )
          ) {
            break;
          }
          if (Date.now() >= deadline) break;
          await sleep(config.pollIntervalMs);
        }
        for (const [name, expected] of Object.entries(fixture.expected)) {
          if (!sameValue(hostA[name], expected)) {
            throw new Error(
              `${name} reads ${JSON.stringify(hostA[name])}, expected ${JSON.stringify(expected)}; Host A=${JSON.stringify(hostA)}`,
            );
          }
          const empty = hostZ[name];
          if (Array.isArray(expected)) {
            if (Array.isArray(empty) && empty.length > 0) {
              throw new Error(
                `${name} leaked into the unmatched host: ${JSON.stringify(empty)}`,
              );
            }
          } else if (Number(empty ?? 0) !== 0) {
            throw new Error(
              `${name} leaked into the unmatched host: ${JSON.stringify(empty)}`,
            );
          }
        }
        return { dialogBox, groupBox, addBox, hostA, hostZ, pageErrors };
      },
    );

    return {
      details: {
        sourceTableId: fixture.sourceTableId,
        hostTableId: fixture.hostTableId,
        layout: config.layout,
        routing,
        editorBounds: {
          dialog: probe.dialogBox,
          group: probe.groupBox,
          add: probe.addBox,
        },
        hostA: probe.hostA,
        hostZ: probe.hostZ,
        pageErrors: probe.pageErrors,
      },
    };
  } finally {
    await browser?.close().catch(() => undefined);
    for (const tableId of tableIds) {
      await permanentDeleteTable(baseId, tableId).catch(() => undefined);
    }
    await rm(tempDir, { recursive: true, force: true });
  }
};
