import {
  Colors,
  FieldType,
  NumberFormattingType,
  Relationship,
  SingleNumberDisplayType,
} from "@teable/core";
import {
  createField,
  createTable,
  getField,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  LookupInheritedDisplayCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A source number column with a currency format and a ring display, looked up
// through a single-record link and through a multi-record link, neither
// lookup naming a format -> checkpoint: both inherit the currency format; the
// single lookup keeps the ring, the multi lookup drops it.
//
// A ring draws one number as a share of a maximum. A cell holding several
// numbers has no single share to draw, so a lookup that can return several
// values cannot use it - yet it inherited the ring anyway, and every editor
// and renderer downstream had to cope with a setting that cannot apply. The
// single-record lookup is the control: inheriting there is right, and a fix
// that stripped display options everywhere would fail it.

const NAME_FIELD = "Name";
const AMOUNT_FIELD = "Amount";

export const runLookupInheritedDisplayCase = async (
  bugCase: BugCaseFor<"lookup-inherited-display">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: LookupInheritedDisplayCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const formatting = {
    type: NumberFormattingType.Currency,
    precision: config.precision,
    symbol: config.currencySymbol,
  };
  const showAs = {
    type: SingleNumberDisplayType.Ring,
    color: Colors.Blue,
    showValue: true,
    maxValue: 100,
  };

  try {
    const source = await createTable(baseId, {
      name: `${config.tableNamePrefix}-source-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        {
          name: AMOUNT_FIELD,
          type: FieldType.Number,
          options: { formatting, showAs },
        },
      ],
      records: [{ fields: { [NAME_FIELD]: "item", [AMOUNT_FIELD]: 10 } }],
    });
    tableIds.push(source.id);
    const host = await createTable(baseId, {
      name: `${config.tableNamePrefix}-host-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "order" } }],
    });
    tableIds.push(host.id);
    const amountId = source.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id;
    if (!amountId) {
      throw new Error(`table ${source.id} has no ${AMOUNT_FIELD} column`);
    }
    const links = {
      single: await createField(host.id, {
        name: "One item",
        type: FieldType.Link,
        options: {
          relationship: Relationship.ManyOne,
          foreignTableId: source.id,
        },
      }),
      multiple: await createField(host.id, {
        name: "Many items",
        type: FieldType.Link,
        options: {
          relationship: Relationship.ManyMany,
          foreignTableId: source.id,
        },
      }),
    };

    const probe = await bugCheckpoint(
      "a-lookup-inherits-only-the-display-its-cell-can-use",
      async () => {
        const seen: Record<string, unknown> = {};
        const problems: string[] = [];
        for (const [shape, link] of Object.entries(links)) {
          const created = await rawRequest<{ id?: string }>(
            "POST",
            `/table/${host.id}/field`,
            {
              name: `Amount via ${shape}`,
              type: FieldType.Number,
              isLookup: true,
              lookupOptions: {
                linkFieldId: link.id,
                foreignTableId: source.id,
                lookupFieldId: amountId,
              },
            },
          );
          if (!isSuccess(created) || !created.data?.id) {
            throw new Error(
              `creating the ${shape} lookup answered ${describeResponse(created)}`,
            );
          }
          assertServedByV2(created.headers, {
            operation: "POST /table/{tableId}/field",
            feature: "createField",
          });
          const stored = await getField(host.id, created.data.id);
          const options = (stored.options ?? {}) as Record<string, unknown>;
          seen[shape] = options;
          if (
            JSON.stringify(options.formatting) !== JSON.stringify(formatting)
          ) {
            problems.push(
              `the ${shape} lookup's format is ${JSON.stringify(options.formatting)}, expected the source's ${JSON.stringify(formatting)}`,
            );
          }
          const hasRing =
            (options.showAs as { type?: string } | undefined)?.type ===
            showAs.type;
          if (shape === "single" && !hasRing) {
            problems.push(
              `the single lookup lost the ring it can draw (${JSON.stringify(options.showAs)})`,
            );
          }
          if (shape === "multiple" && "showAs" in options) {
            problems.push(
              `the multiple lookup kept a display it cannot draw: ${JSON.stringify(options.showAs)}`,
            );
          }
        }
        if (problems.length > 0) {
          throw new Error(problems.join("; "));
        }
        return seen;
      },
    );

    return { details: { hostTableId: host.id, options: probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
