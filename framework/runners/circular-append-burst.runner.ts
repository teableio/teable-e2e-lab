import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import { createRecords as apiCreateRecords } from "@teable/openapi";
import {
  createField,
  createTable,
  getFields,
  getRecord,
  getRecords,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { chunk } from "../chunk";
import { assertHybridComputedRuntime, assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CircularAppendBurstCaseConfig } from "../types";
import {
  ORDER_ATTR_COUNT,
  ORDER_FORMULAS,
  ORDER_NUM_COUNT,
  ORDER_TEXT_COUNT,
  PLASMID_BACKBONE_FIELD,
  PLASMID_GRADE_FIELD,
  PLASMID_METRIC_COUNT,
  PLASMID_NOTE_COUNT,
  PLASMID_TOTAL_FIELD,
  PLASMID_TYPE_KEY_FIELD,
  PURIFICATION_BATCH_FIELD,
  PURIFICATION_EXPRESSION_FIELD,
  PURIFICATION_FORMULAS,
  PURIFICATION_METHOD_FIELD,
  PURIFICATION_NUM_COUNT,
  PURIFICATION_OPERATOR_FIELD,
  PURIFICATION_ORDER_LINK_FIELD,
  PURIFICATION_ORDER_LOOKUPS,
  PURIFICATION_PLASMID_LINK_FIELD,
  PURIFICATION_PLASMID_LOOKUPS,
  PURIFICATION_PURITY_FIELD,
  PURIFICATION_SELECT_COUNT,
  PURIFICATION_SUBORDER_LOOKUPS,
  PURIFICATION_TEXT_COUNT,
  PURIFICATION_YIELD_FIELD,
  SELECT_OPTIONS,
  SUBORDER_DATE_COUNT,
  SUBORDER_FORMULAS,
  SUBORDER_NUM_COUNT,
  SUBORDER_ORDER_LINK_FIELD,
  SUBORDER_ORDER_LOOKUPS,
  SUBORDER_PLASMID_CONDITIONAL_LOOKUPS,
  SUBORDER_PLASMID_LINK_FIELD,
  SUBORDER_PLASMID_TYPE_KEY_FIELD,
  SUBORDER_PURIFICATION_LINK_DUP_FIELD,
  SUBORDER_PURIFICATION_LINK_FIELD,
  SUBORDER_PURIFICATION_LOOKUPS,
  SUBORDER_SELECT_COUNT,
  SUBORDER_TEXT_COUNT,
  TITLE_FIELD,
  appendedHostSubOrderRows,
  appendedPurificationRows,
  expectedPurificationComputed,
  expectedSubOrderComputed,
  numberedField,
  orderAttr,
  orderNum,
  orderRowForPurification,
  orderRowForSubOrder,
  orderText,
  orderTitle,
  plasmidBackbone,
  plasmidGrade,
  plasmidMetric,
  plasmidNote,
  plasmidRowForPurification,
  plasmidRowForSubOrder,
  plasmidTitle,
  plasmidTotalAmount,
  plasmidTypeKey,
  purificationBatchCode,
  purificationExpressionValue,
  purificationMethod,
  purificationNum,
  purificationOperator,
  purificationPurity,
  purificationRowBySubOrderRow,
  purificationSelect,
  purificationText,
  purificationTitle,
  purificationYield,
  subOrderDate,
  subOrderNum,
  subOrderPlasmidTypeKey,
  subOrderRowForPurification,
  subOrderSelect,
  subOrderText,
  subOrderTitle,
  type ExpectedCell,
  type LookupValueKind,
} from "./circular-append-burst-workload";

// Rebuild the four-table circular-lookup fixture behind the 2026-08-27 CN
// production incident, then do what that base's users did: append rows to the
// Purification table in quick sequential bulk batches, every row wiring all
// four link cells -> checkpoint: within a bounded window, EVERY host
// sub-order exposes the appended row through its lookups and formulas, and
// every appended row exposes its own computed state.
//
// Under the hybrid computed-update strategy (the production default; see
// framework/engine.ts) each batch's write answers 201 and queues part of its
// computed propagation to the outbox, whose dispatched task runs with
// lockWait: false against the per-table computed advisory lock. The next
// batch's inline run holds that lock, the dispatched task fails
// (computed:run:failed lock_unavailable), and its steps are DROPPED — no
// pending outbox row survives, no error reaches the writer. The result is
// host rows whose lookups never converge: silent stale data, the loss face
// of incident T7002, and a path teable-ee#3207's inline bounding does not
// close.
//
// Waiting is the assertion, exactly as in computed-value-lands: asynchronous
// convergence within the window passes, "never" is the only thing that
// fails. The window is generous — a healthy sync-mode run of this exact
// operation converges in ~13s at this scale, and the bounded window is an
// order of magnitude above that.
//
// The seed phase deliberately does NOT provoke the race it exists to set up:
// batches during seeding are paced by waiting for a probe row of each batch
// to settle before sending the next, so the fixture comes up deterministic
// and the burst inside the checkpoint is the only back-to-back write. A
// fixture corrupted by its own seeding would be an error, not the bug.

type NamedField = {
  id: string;
  name: string;
  options?: { symmetricFieldId?: string };
};

type TableFieldIds = Record<string, string>;

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const range = (count: number) =>
  Array.from({ length: count }, (_, index) => index + 1);

const textField = (name: string) => ({
  name,
  type: FieldType.SingleLineText,
});
const numberField = (name: string) => ({ name, type: FieldType.Number });
const selectField = (name: string) => ({
  name,
  type: FieldType.SingleSelect,
  options: { choices: SELECT_OPTIONS.map((option) => ({ name: option })) },
});
const dateField = (name: string) => ({
  name,
  type: FieldType.Date,
  options: {
    formatting: { date: "YYYY-MM-DD", time: "None", timeZone: "UTC" },
  },
});

const lookupFieldType = (kind: LookupValueKind) => {
  switch (kind) {
    case "number":
      return FieldType.Number;
    case "select":
      return FieldType.SingleSelect;
    case "link":
      return FieldType.Link;
    // The server requires the lookup's declared type to equal the looked-up
    // field's type, so formula-target lookups are created as formula fields.
    case "formula":
      return FieldType.Formula;
    default:
      return FieldType.SingleLineText;
  }
};

const fieldIdMap = (fields: NamedField[]): TableFieldIds =>
  Object.fromEntries(fields.map((field) => [field.name, field.id]));

const resolveNamedField = (fields: NamedField[], fieldName: string) => {
  const field = fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    throw new Error(
      `Missing field ${fieldName}; available: ${fields
        .map(({ name }) => name)
        .join(", ")}`,
    );
  }
  return field;
};

const compileFormulaExpression = (
  expression: string,
  fieldIdByName: TableFieldIds,
) =>
  expression.replace(/\{([^}]+)\}/g, (match, fieldName: string) => {
    const fieldId = fieldIdByName[fieldName];
    return fieldId ? `{${fieldId}}` : match;
  });

// Lookup cells surface either the scalar value or a single-element array
// depending on cellFormat; link cells surface {id,title}. Normalize all
// shapes before comparing.
const normalizeLookupValue = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }
    if (value.length === 1) {
      return normalizeLookupValue(value[0]);
    }
    return JSON.stringify(value);
  }
  if (typeof value === "object" && "title" in (value as object)) {
    const title = (value as { title?: unknown }).title;
    return typeof title === "string" ? title : JSON.stringify(value);
  }
  return typeof value === "string" ? value : String(value);
};

const isLookupFieldName = (name: string) =>
  name.startsWith("lu_") || name.startsWith("clu_");

type CellMismatch = { field: string; expected: string; actual: string };

const cellMismatch = (
  fieldName: string,
  raw: unknown,
  expected: ExpectedCell,
): CellMismatch | undefined => {
  if (expected.kind === "skip") {
    return undefined;
  }
  if (expected.kind === "empty") {
    const actual = normalizeLookupValue(raw);
    return actual === null
      ? undefined
      : { field: fieldName, expected: "(empty)", actual: String(actual) };
  }
  if (isLookupFieldName(fieldName)) {
    const actual = normalizeLookupValue(raw);
    return actual === String(expected.value)
      ? undefined
      : {
          field: fieldName,
          expected: String(expected.value),
          actual: String(actual),
        };
  }
  if (typeof expected.value === "number") {
    return raw != null && Number(raw) === expected.value
      ? undefined
      : {
          field: fieldName,
          expected: String(expected.value),
          actual: String(raw),
        };
  }
  return raw === expected.value
    ? undefined
    : {
        field: fieldName,
        expected: String(expected.value),
        actual: String(raw),
      };
};

// First mismatch between a live row and its expected computed state, or
// undefined when the row has fully converged.
const firstMismatch = (
  fields: Record<string, unknown>,
  fieldIds: TableFieldIds,
  expected: Record<string, ExpectedCell>,
): CellMismatch | undefined => {
  for (const [fieldName, expectation] of Object.entries(expected)) {
    const fieldId = fieldIds[fieldName];
    if (!fieldId) {
      throw new Error(
        `No field id for ${fieldName} — the fixture is not in place`,
      );
    }
    const mismatch = cellMismatch(fieldName, fields[fieldId], expectation);
    if (mismatch) {
      return mismatch;
    }
  }
  return undefined;
};

const describeMismatch = (rowLabel: string, mismatch: CellMismatch) =>
  `${rowLabel} ${mismatch.field} expected ${mismatch.expected}, actual ${mismatch.actual}`;

export const runCircularAppendBurstCase = async (
  bugCase: BugCaseFor<"circular-append-burst">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CircularAppendBurstCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;

  // Setup guard: this case observes the outbox dispatch seam, which only
  // exists when the app was booted hybrid. See framework/engine.ts.
  assertHybridComputedRuntime(bugCase.id);

  // Injectivity over seed + appended range, proven before any table exists:
  // every appended row must land on its own previously purification-free
  // host, or "the lookup is empty" and "the lookup never arrived" collapse.
  purificationRowBySubOrderRow(config, "appended");
  // The race needs a batch to arrive while the previous batch's dispatch is
  // in flight — a single batch has nothing to race and would pass vacuously.
  if (config.appendRowCount <= config.appendBatchSize) {
    throw new Error(
      `appendRowCount (${config.appendRowCount}) must exceed appendBatchSize ` +
        `(${config.appendBatchSize}) so the burst has at least two batches`,
    );
  }
  const appendedRows = appendedPurificationRows(config);
  const hostRows = appendedHostSubOrderRows(config);

  const createdTableIds: string[] = [];

  // One paced seed batch: create the records, then wait for a probe row of
  // the batch to settle before the caller sends the next batch. Returns the
  // created record ids and the response headers of the LAST request, so the
  // caller can assert v2 routing on the exact operation the checkpoint will
  // later perform back-to-back.
  const seedInBatches = async (
    tableId: string,
    records: Array<Record<string, unknown>>,
    batchSize: number,
    fieldKeyType: FieldKeyType,
    settleProbe?: (
      batchRecordIds: string[],
      firstIndexInBatch: number,
    ) => Promise<void>,
  ) => {
    const recordIds: string[] = [];
    let headers: Record<string, unknown> = {};
    for (const batch of chunk(records, batchSize)) {
      const response = await apiCreateRecords(tableId, {
        fieldKeyType,
        typecast: true,
        records: batch.map((fields) => ({ fields })),
      });
      if (response.status !== 201) {
        throw new Error(
          `Seeding ${tableId} answered ${response.status} for a batch of ${batch.length}`,
        );
      }
      const created = response.data.records ?? [];
      if (created.length !== batch.length) {
        throw new Error(
          `Seeding ${tableId}: sent ${batch.length} records, got ${created.length} back`,
        );
      }
      const firstIndexInBatch = recordIds.length;
      for (const record of created) {
        recordIds.push(record.id);
      }
      headers = response.headers as Record<string, unknown>;
      if (settleProbe) {
        await settleProbe(
          created.map((record) => record.id),
          firstIndexInBatch,
        );
      }
    }
    return { recordIds, headers };
  };

  // Wait until a single row's computed state matches its expectation. Used to
  // pace seed batches (probe the batch's last row) and to verify fixture
  // samples — always OUTSIDE the checkpoint.
  const waitForRow = async (
    tableId: string,
    recordId: string,
    rowLabel: string,
    fieldIds: TableFieldIds,
    expected: Record<string, ExpectedCell>,
  ) => {
    const deadline = Date.now() + config.seedSettleTimeoutMs;
    let mismatch: CellMismatch | undefined;
    for (;;) {
      const record = await getRecord(tableId, recordId);
      mismatch = firstMismatch(record.fields ?? {}, fieldIds, expected);
      if (!mismatch) {
        return;
      }
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(config.pollIntervalMs);
    }
    throw new Error(
      `Seed row never settled within ${config.seedSettleTimeoutMs}ms: ` +
        describeMismatch(rowLabel, mismatch),
    );
  };

  try {
    // --- Plasmid (conditional-lookup source; no computed fields) ---
    const plasmid = await createTable(baseId, {
      name: `${suffix}-plasmid`,
      fields: [
        textField(TITLE_FIELD),
        textField(PLASMID_TYPE_KEY_FIELD),
        numberField(PLASMID_TOTAL_FIELD),
        textField(PLASMID_BACKBONE_FIELD),
        textField(PLASMID_GRADE_FIELD),
        ...range(PLASMID_NOTE_COUNT).map((i) =>
          textField(numberedField("pl_note", i)),
        ),
        ...range(PLASMID_METRIC_COUNT).map((i) =>
          numberField(numberedField("pl_metric", i)),
        ),
      ],
      records: [],
    });
    createdTableIds.push(plasmid.id);
    const { recordIds: plasmidRecordIds } = await seedInBatches(
      plasmid.id,
      range(config.plasmidRowCount).map((n) => ({
        [TITLE_FIELD]: plasmidTitle(n),
        [PLASMID_TYPE_KEY_FIELD]: plasmidTypeKey(n),
        [PLASMID_TOTAL_FIELD]: plasmidTotalAmount(n),
        [PLASMID_BACKBONE_FIELD]: plasmidBackbone(n),
        [PLASMID_GRADE_FIELD]: plasmidGrade(n),
        ...Object.fromEntries(
          range(PLASMID_NOTE_COUNT).map((i) => [
            numberedField("pl_note", i),
            plasmidNote(i, n),
          ]),
        ),
        ...Object.fromEntries(
          range(PLASMID_METRIC_COUNT).map((i) => [
            numberedField("pl_metric", i),
            plasmidMetric(i, n),
          ]),
        ),
      })),
      config.seedBatchSize,
      FieldKeyType.Name,
    );

    // --- Orders (6 own-field formulas, then records) ---
    const orders = await createTable(baseId, {
      name: `${suffix}-orders`,
      fields: [
        textField(TITLE_FIELD),
        ...range(ORDER_ATTR_COUNT).map((i) =>
          textField(numberedField("o_attr", i)),
        ),
        ...range(ORDER_TEXT_COUNT).map((i) =>
          textField(numberedField("o_text", i)),
        ),
        ...range(ORDER_NUM_COUNT).map((i) =>
          numberField(numberedField("o_num", i)),
        ),
      ],
      records: [],
    });
    createdTableIds.push(orders.id);
    const orderFieldIds = fieldIdMap(
      (await getFields(orders.id)) as NamedField[],
    );
    for (const formula of ORDER_FORMULAS) {
      const created = await createField(orders.id, {
        name: formula.name,
        type: FieldType.Formula,
        options: {
          expression: compileFormulaExpression(
            formula.expression,
            orderFieldIds,
          ),
        },
      });
      orderFieldIds[formula.name] = created.id;
    }
    const { recordIds: orderRecordIds } = await seedInBatches(
      orders.id,
      range(config.orderRowCount).map((n) => ({
        [TITLE_FIELD]: orderTitle(n),
        ...Object.fromEntries(
          range(ORDER_ATTR_COUNT).map((i) => [
            numberedField("o_attr", i),
            orderAttr(i, n),
          ]),
        ),
        ...Object.fromEntries(
          range(ORDER_TEXT_COUNT).map((i) => [
            numberedField("o_text", i),
            orderText(i, n),
          ]),
        ),
        ...Object.fromEntries(
          range(ORDER_NUM_COUNT).map((i) => [
            numberedField("o_num", i),
            orderNum(i, n),
          ]),
        ),
      })),
      config.seedBatchSize,
      FieldKeyType.Name,
    );

    // --- SubOrders + Purification shells, then the link graph ---
    const subOrders = await createTable(baseId, {
      name: `${suffix}-sub-orders`,
      fields: [
        textField(TITLE_FIELD),
        textField(SUBORDER_PLASMID_TYPE_KEY_FIELD),
        ...range(SUBORDER_TEXT_COUNT).map((i) =>
          textField(numberedField("so_text", i)),
        ),
        ...range(SUBORDER_NUM_COUNT).map((i) =>
          numberField(numberedField("so_num", i)),
        ),
        ...range(SUBORDER_SELECT_COUNT).map((i) =>
          selectField(numberedField("so_select", i)),
        ),
        ...range(SUBORDER_DATE_COUNT).map((i) =>
          dateField(numberedField("so_date", i)),
        ),
      ],
      records: [],
    });
    createdTableIds.push(subOrders.id);
    const purification = await createTable(baseId, {
      name: `${suffix}-purification`,
      fields: [
        textField(TITLE_FIELD),
        numberField(PURIFICATION_EXPRESSION_FIELD),
        textField(PURIFICATION_BATCH_FIELD),
        textField(PURIFICATION_OPERATOR_FIELD),
        textField(PURIFICATION_METHOD_FIELD),
        numberField(PURIFICATION_PURITY_FIELD),
        numberField(PURIFICATION_YIELD_FIELD),
        ...range(PURIFICATION_TEXT_COUNT).map((i) =>
          textField(numberedField("p_text", i)),
        ),
        ...range(PURIFICATION_NUM_COUNT).map((i) =>
          numberField(numberedField("p_num", i)),
        ),
        ...range(PURIFICATION_SELECT_COUNT).map((i) =>
          selectField(numberedField("p_select", i)),
        ),
      ],
      records: [],
    });
    createdTableIds.push(purification.id);

    const createLink = (
      tableId: string,
      name: string,
      foreignTableId: string,
      relationship: Relationship,
      isOneWay: boolean,
    ) =>
      createField(tableId, {
        name,
        type: FieldType.Link,
        options: { relationship, foreignTableId, isOneWay },
      });
    await createLink(
      subOrders.id,
      SUBORDER_ORDER_LINK_FIELD,
      orders.id,
      Relationship.ManyOne,
      true,
    );
    await createLink(
      subOrders.id,
      SUBORDER_PLASMID_LINK_FIELD,
      plasmid.id,
      Relationship.ManyOne,
      true,
    );
    // The duplicate one-many pair — the incident base carried the same
    // purification link twice, doubling the dependency edges.
    await createLink(
      subOrders.id,
      SUBORDER_PURIFICATION_LINK_FIELD,
      purification.id,
      Relationship.OneMany,
      false,
    );
    await createLink(
      subOrders.id,
      SUBORDER_PURIFICATION_LINK_DUP_FIELD,
      purification.id,
      Relationship.OneMany,
      false,
    );
    await createLink(
      purification.id,
      PURIFICATION_PLASMID_LINK_FIELD,
      plasmid.id,
      Relationship.ManyOne,
      true,
    );
    await createLink(
      purification.id,
      PURIFICATION_ORDER_LINK_FIELD,
      orders.id,
      Relationship.ManyOne,
      true,
    );

    const subOrderFieldVos = (await getFields(subOrders.id)) as NamedField[];
    const subOrderFields = fieldIdMap(subOrderFieldVos);
    const backrefFieldId = resolveNamedField(
      subOrderFieldVos,
      SUBORDER_PURIFICATION_LINK_FIELD,
    ).options?.symmetricFieldId;
    const backrefDupFieldId = resolveNamedField(
      subOrderFieldVos,
      SUBORDER_PURIFICATION_LINK_DUP_FIELD,
    ).options?.symmetricFieldId;
    if (!backrefFieldId || !backrefDupFieldId) {
      throw new Error(
        "One-many purification links did not create symmetric fields",
      );
    }
    const plasmidFieldIds = fieldIdMap(
      (await getFields(plasmid.id)) as NamedField[],
    );
    const purificationFields = fieldIdMap(
      (await getFields(purification.id)) as NamedField[],
    );

    const createLookup = async (
      tableId: string,
      fields: TableFieldIds,
      name: string,
      kind: LookupValueKind,
      foreignTableId: string,
      linkFieldId: string,
      lookupFieldId: string,
    ) => {
      const created = await createField(tableId, {
        name,
        type: lookupFieldType(kind),
        isLookup: true,
        lookupOptions: { foreignTableId, linkFieldId, lookupFieldId },
      });
      fields[name] = created.id;
    };
    const createFormulas = async (
      tableId: string,
      fields: TableFieldIds,
      formulas: Array<{ name: string; expression: string }>,
    ) => {
      for (const formula of formulas) {
        const created = await createField(tableId, {
          name: formula.name,
          type: FieldType.Formula,
          options: {
            expression: compileFormulaExpression(formula.expression, fields),
          },
        });
        fields[formula.name] = created.id;
      }
    };

    // --- SubOrders computed wave 1: order lookups + conditional lookups ---
    for (const spec of SUBORDER_ORDER_LOOKUPS) {
      await createLookup(
        subOrders.id,
        subOrderFields,
        spec.name,
        spec.kind,
        orders.id,
        subOrderFields[SUBORDER_ORDER_LINK_FIELD]!,
        orderFieldIds[spec.target]!,
      );
    }
    for (const spec of SUBORDER_PLASMID_CONDITIONAL_LOOKUPS) {
      const created = await createField(subOrders.id, {
        name: spec.name,
        type: lookupFieldType(spec.kind),
        isLookup: true,
        isConditionalLookup: true,
        lookupOptions: {
          foreignTableId: plasmid.id,
          lookupFieldId: plasmidFieldIds[spec.target]!,
          filter: {
            conjunction: "and",
            filterSet: [
              {
                fieldId: plasmidFieldIds[PLASMID_TYPE_KEY_FIELD]!,
                operator: "is",
                value: {
                  type: "field",
                  fieldId: subOrderFields[SUBORDER_PLASMID_TYPE_KEY_FIELD]!,
                },
              },
            ],
          },
          limit: 1,
        },
      } as never);
      subOrderFields[spec.name] = created.id;
    }

    // --- Purification computed wave 1: plasmid/order lookups + reverse
    // lookups of SubOrders plain fields (the formula-target reverse lookup
    // waits for wave 2) ---
    for (const spec of PURIFICATION_PLASMID_LOOKUPS) {
      await createLookup(
        purification.id,
        purificationFields,
        spec.name,
        spec.kind,
        plasmid.id,
        purificationFields[PURIFICATION_PLASMID_LINK_FIELD]!,
        plasmidFieldIds[spec.target]!,
      );
    }
    for (const spec of PURIFICATION_ORDER_LOOKUPS) {
      await createLookup(
        purification.id,
        purificationFields,
        spec.name,
        spec.kind,
        orders.id,
        purificationFields[PURIFICATION_ORDER_LINK_FIELD]!,
        orderFieldIds[spec.target]!,
      );
    }
    const reverseLinkIdFor = (via: "backref" | "backref-dup") =>
      via === "backref" ? backrefFieldId : backrefDupFieldId;
    for (const spec of PURIFICATION_SUBORDER_LOOKUPS.filter(
      (candidate) => candidate.target !== "so_expression_card",
    )) {
      await createLookup(
        purification.id,
        purificationFields,
        spec.name,
        spec.kind,
        subOrders.id,
        reverseLinkIdFor(spec.via),
        subOrderFields[spec.target]!,
      );
    }
    await createFormulas(
      purification.id,
      purificationFields,
      PURIFICATION_FORMULAS.filter((formula) => formula.wave === 1),
    );

    // --- SubOrders computed wave 2: purification lookups (incl. the
    // formula-over-lookup pull of actual_expression) + formulas ---
    for (const spec of SUBORDER_PURIFICATION_LOOKUPS) {
      await createLookup(
        subOrders.id,
        subOrderFields,
        spec.name,
        spec.kind,
        purification.id,
        subOrderFields[SUBORDER_PURIFICATION_LINK_FIELD]!,
        purificationFields[spec.target]!,
      );
    }
    await createFormulas(subOrders.id, subOrderFields, SUBORDER_FORMULAS);

    // --- Purification computed wave 2: close the circle ---
    for (const spec of PURIFICATION_SUBORDER_LOOKUPS.filter(
      (candidate) => candidate.target === "so_expression_card",
    )) {
      await createLookup(
        purification.id,
        purificationFields,
        spec.name,
        spec.kind,
        subOrders.id,
        reverseLinkIdFor(spec.via),
        subOrderFields[spec.target]!,
      );
    }
    await createFormulas(
      purification.id,
      purificationFields,
      PURIFICATION_FORMULAS.filter((formula) => formula.wave === 2),
    );

    // --- Seed SubOrders (order + plasmid links at insert), paced ---
    const { recordIds: subOrderRecordIds } = await seedInBatches(
      subOrders.id,
      range(config.subOrderRowCount).map((s) => ({
        [TITLE_FIELD]: subOrderTitle(s),
        [SUBORDER_PLASMID_TYPE_KEY_FIELD]: subOrderPlasmidTypeKey(s, config),
        ...Object.fromEntries(
          range(SUBORDER_TEXT_COUNT).map((i) => [
            numberedField("so_text", i),
            subOrderText(i, s),
          ]),
        ),
        ...Object.fromEntries(
          range(SUBORDER_NUM_COUNT).map((i) => [
            numberedField("so_num", i),
            subOrderNum(i, s),
          ]),
        ),
        ...Object.fromEntries(
          range(SUBORDER_SELECT_COUNT).map((i) => [
            numberedField("so_select", i),
            subOrderSelect(i, s),
          ]),
        ),
        ...Object.fromEntries(
          range(SUBORDER_DATE_COUNT).map((i) => [
            numberedField("so_date", i),
            subOrderDate(),
          ]),
        ),
        [SUBORDER_ORDER_LINK_FIELD]: {
          id: orderRecordIds[orderRowForSubOrder(s, config) - 1]!,
        },
        [SUBORDER_PLASMID_LINK_FIELD]: {
          id: plasmidRecordIds[plasmidRowForSubOrder(s, config) - 1]!,
        },
      })),
      config.seedBatchSize,
      FieldKeyType.Name,
      (batchRecordIds, firstIndexInBatch) => {
        const rowNumber = firstIndexInBatch + batchRecordIds.length;
        return waitForRow(
          subOrders.id,
          batchRecordIds[batchRecordIds.length - 1]!,
          `SubOrder ${rowNumber}`,
          subOrderFields,
          expectedSubOrderComputed(rowNumber, config, undefined),
        );
      },
    );

    // One Purification row payload (field ids as keys because the two
    // symmetric backref cells have server-generated names; both backrefs wire
    // to the SAME sub-order — the duplicate-link fingerprint). Shared by the
    // seed and by the burst inside the checkpoint.
    const purificationRecordFields = (p: number): Record<string, unknown> => {
      const s = subOrderRowForPurification(p, config);
      return {
        [purificationFields[TITLE_FIELD]!]: purificationTitle(p),
        [purificationFields[PURIFICATION_EXPRESSION_FIELD]!]:
          purificationExpressionValue(p),
        [purificationFields[PURIFICATION_BATCH_FIELD]!]:
          purificationBatchCode(p),
        [purificationFields[PURIFICATION_OPERATOR_FIELD]!]:
          purificationOperator(p),
        [purificationFields[PURIFICATION_METHOD_FIELD]!]: purificationMethod(p),
        [purificationFields[PURIFICATION_PURITY_FIELD]!]: purificationPurity(p),
        [purificationFields[PURIFICATION_YIELD_FIELD]!]: purificationYield(p),
        ...Object.fromEntries(
          range(PURIFICATION_TEXT_COUNT).map((i) => [
            purificationFields[numberedField("p_text", i)]!,
            purificationText(i, p),
          ]),
        ),
        ...Object.fromEntries(
          range(PURIFICATION_NUM_COUNT).map((i) => [
            purificationFields[numberedField("p_num", i)]!,
            purificationNum(i, p),
          ]),
        ),
        ...Object.fromEntries(
          range(PURIFICATION_SELECT_COUNT).map((i) => [
            purificationFields[numberedField("p_select", i)]!,
            purificationSelect(i, p),
          ]),
        ),
        [backrefFieldId]: { id: subOrderRecordIds[s - 1]! },
        [backrefDupFieldId]: { id: subOrderRecordIds[s - 1]! },
        [purificationFields[PURIFICATION_PLASMID_LINK_FIELD]!]: {
          id: plasmidRecordIds[plasmidRowForPurification(p, config) - 1]!,
        },
        [purificationFields[PURIFICATION_ORDER_LINK_FIELD]!]: {
          id: orderRecordIds[orderRowForPurification(p, config) - 1]!,
        },
      };
    };

    // --- Seed Purification, paced on both ends of the cascade: the row's own
    // computed state AND its host sub-order's, so no batch is in flight when
    // the next one is sent ---
    await seedInBatches(
      purification.id,
      range(config.purificationRowCount).map((p) =>
        purificationRecordFields(p),
      ),
      config.purificationSeedBatchSize,
      FieldKeyType.Id,
      async (batchRecordIds, firstIndexInBatch) => {
        const p = firstIndexInBatch + batchRecordIds.length;
        await waitForRow(
          purification.id,
          batchRecordIds[batchRecordIds.length - 1]!,
          `Purification ${p}`,
          purificationFields,
          expectedPurificationComputed(p, config),
        );
        const host = subOrderRowForPurification(p, config);
        await waitForRow(
          subOrders.id,
          subOrderRecordIds[host - 1]!,
          `SubOrder ${host}`,
          subOrderFields,
          expectedSubOrderComputed(host, config, p),
        );
      },
    );

    // Fixture verification, outside the checkpoint: the ENTIRE seed settled.
    // The per-batch pacing above probes one row per batch, which paces but
    // does not prove the whole batch's propagation landed — and a seed
    // corrupted by the very race this case observes must be judged an error,
    // not the bug. Full paged scans of both cascade tables, retried until
    // every row matches its expected state, close that gap; they also prove
    // every future host starts purification-free, so "the lookup arrived"
    // in the checkpoint cannot be a leftover.
    const seedMap = purificationRowBySubOrderRow(config, "seed");
    const scanSeedOnce = async (): Promise<CellMismatch | undefined> => {
      const scanTable = async (
        tableId: string,
        totalRows: number,
        titleFieldId: string,
        titlePrefix: string,
        expectedFor: (row: number) => Record<string, ExpectedCell>,
        fieldIds: TableFieldIds,
      ): Promise<CellMismatch | undefined> => {
        let scanned = 0;
        for (let skip = 0; skip < totalRows; skip += 1000) {
          const page = await getRecords(tableId, {
            fieldKeyType: FieldKeyType.Id,
            skip,
            take: 1000,
          });
          for (const record of page.records) {
            const title = String(record.fields?.[titleFieldId] ?? "");
            if (!title.startsWith(titlePrefix)) {
              throw new Error(
                `Unexpected row "${title}" while scanning ${titlePrefix.trim()} seed`,
              );
            }
            const row = Number(title.slice(titlePrefix.length));
            const mismatch = firstMismatch(
              record.fields ?? {},
              fieldIds,
              expectedFor(row),
            );
            if (mismatch) {
              return {
                ...mismatch,
                field: `${titlePrefix}${row} ${mismatch.field}`,
              };
            }
            scanned += 1;
          }
        }
        if (scanned !== totalRows) {
          throw new Error(
            `${titlePrefix.trim()} seed scan found ${scanned} rows, expected ${totalRows}`,
          );
        }
        return undefined;
      };
      return (
        (await scanTable(
          purification.id,
          config.purificationRowCount,
          purificationFields[TITLE_FIELD]!,
          "Purification ",
          (p) => expectedPurificationComputed(p, config),
          purificationFields,
        )) ??
        (await scanTable(
          subOrders.id,
          config.subOrderRowCount,
          subOrderFields[TITLE_FIELD]!,
          "SubOrder ",
          (s) => expectedSubOrderComputed(s, config, seedMap.get(s)),
          subOrderFields,
        ))
      );
    };
    {
      const deadline = Date.now() + config.seedSettleTimeoutMs;
      for (;;) {
        const mismatch = await scanSeedOnce();
        if (!mismatch) {
          break;
        }
        if (Date.now() >= deadline) {
          throw new Error(
            `Seed never fully settled within ${config.seedSettleTimeoutMs}ms — the fixture is not in place: ` +
              `${mismatch.field} expected ${mismatch.expected}, actual ${mismatch.actual}`,
          );
        }
        await sleep(config.pollIntervalMs);
      }
    }

    // The burst: sequential bulk INSERT batches, back-to-back — the write
    // shape the incident base produced. Each batch's inline run takes the
    // per-table computed lock while the previous batch's dispatched outbox
    // task is trying to acquire it. The writes stay OUTSIDE the checkpoint:
    // in the incident every write succeeded, so a refused write here is a
    // different bug and must read as an error, not this reproduction. That
    // also lets every append response carry the v2 routing assertion — the
    // exact requests the case depends on, not a seed-phase stand-in.
    const appendedRecordIdByRow = new Map<number, string>();
    let routing = undefined as ReturnType<typeof assertServedByV2> | undefined;
    for (const batch of chunk(appendedRows, config.appendBatchSize)) {
      const response = await apiCreateRecords(purification.id, {
        fieldKeyType: FieldKeyType.Id,
        typecast: true,
        records: batch.map((p) => ({
          fields: purificationRecordFields(p),
        })),
      });
      if (response.status !== 201) {
        throw new Error(
          `Append batch answered ${response.status} for ${batch.length} records`,
        );
      }
      // Header inspection only — adds no delay between batches.
      routing = assertServedByV2(response.headers as Record<string, unknown>, {
        operation: "POST /table/{tableId}/record",
        feature: "createRecord",
      });
      const created = response.data.records ?? [];
      if (created.length !== batch.length) {
        throw new Error(
          `Append batch created ${created.length} of ${batch.length} records`,
        );
      }
      created.forEach((record, index) => {
        appendedRecordIdByRow.set(batch[index]!, record.id);
      });
    }

    const probe = await bugCheckpoint(
      "every-appended-rows-host-converges",
      async () => {
        // Bounded convergence: every appended row's host sub-order must
        // expose the complete post-append lookup + formula state, and every
        // appended row its own computed state, through the real read path.
        // Polling waits for values, so asynchronous outbox convergence
        // passes; silently dropped propagation cannot.
        const pendingHosts = new Map<number, number>(); // host row -> p
        appendedRows.forEach((p) => {
          pendingHosts.set(subOrderRowForPurification(p, config), p);
        });
        const pendingAppended = new Set<number>(appendedRows);
        const staleSample = new Map<string, CellMismatch>();
        const deadline = Date.now() + config.convergenceTimeoutMs;
        const startedAt = Date.now();

        for (;;) {
          staleSample.clear();
          for (const [host, p] of [...pendingHosts]) {
            const record = await getRecord(
              subOrders.id,
              subOrderRecordIds[host - 1]!,
            );
            const mismatch = firstMismatch(
              record.fields ?? {},
              subOrderFields,
              expectedSubOrderComputed(host, config, p),
            );
            if (mismatch) {
              staleSample.set(
                `SubOrder ${host} (hosts Purification ${p})`,
                mismatch,
              );
            } else {
              pendingHosts.delete(host);
            }
          }
          for (const p of [...pendingAppended]) {
            const record = await getRecord(
              purification.id,
              appendedRecordIdByRow.get(p)!,
            );
            const mismatch = firstMismatch(
              record.fields ?? {},
              purificationFields,
              expectedPurificationComputed(p, config),
            );
            if (mismatch) {
              staleSample.set(`Purification ${p}`, mismatch);
            } else {
              pendingAppended.delete(p);
            }
          }
          if (pendingHosts.size === 0 && pendingAppended.size === 0) {
            return {
              convergedMs: Date.now() - startedAt,
              appendedRecords: appendedRecordIdByRow.size,
            };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.pollIntervalMs);
        }

        const staleLines = [...staleSample.entries()]
          .slice(0, config.staleRowEvidenceLimit)
          .map(([rowLabel, mismatch]) => describeMismatch(rowLabel, mismatch));
        throw new Error(
          `computed propagation was silently dropped: after ${config.convergenceTimeoutMs}ms, ` +
            `${pendingHosts.size} of ${hostRows.length} host sub-orders and ` +
            `${pendingAppended.size} of ${appendedRows.length} appended rows never converged, ` +
            `while every append batch answered 201 and nothing was reported to the writer. ` +
            `Stale rows: ${staleLines.join("; ")}` +
            (staleSample.size > staleLines.length
              ? ` (and ${staleSample.size - staleLines.length} more)`
              : ""),
        );
      },
    );

    return {
      details: {
        subOrdersTableId: subOrders.id,
        purificationTableId: purification.id,
        ordersTableId: orders.id,
        plasmidTableId: plasmid.id,
        routing,
        seededRows: {
          orders: config.orderRowCount,
          subOrders: config.subOrderRowCount,
          purification: config.purificationRowCount,
          plasmid: config.plasmidRowCount,
        },
        appendedRows: appendedRows.length,
        appendBatchSize: config.appendBatchSize,
        convergence: probe,
      },
    };
  } finally {
    for (const tableId of [...createdTableIds].reverse()) {
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
