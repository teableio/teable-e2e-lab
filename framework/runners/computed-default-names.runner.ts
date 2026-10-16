import { FieldType, Relationship } from "@teable/core";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ComputedDefaultNamesCaseConfig,
} from "../types";
import { describeResponse, dropTables, isSuccess, rawRequest } from "./raw-api";

// A link, a lookup, a rollup, a conditional rollup and a formula, each
// created through the API without a name -> checkpoint: each gets the default
// name the product has always given that kind of column.
//
// Scripts and integrations create computed columns without naming them and
// then find them again by the name the product is known to give. A
// conditional rollup came back as "<field> conditional rollup" where every
// earlier version said "<field> Reference (<table>)", so anything looking it
// up by name stopped finding it. The other four are the control: their names
// were right, and a change that renamed everything would fail them.

const NAME_FIELD = "Name";
const PRICE_FIELD = "Price";

export const runComputedDefaultNamesCase = async (
  bugCase: BugCaseFor<"computed-default-names">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ComputedDefaultNamesCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableIds: string[] = [];
  const productsName = `${config.tableNamePrefix}-products-${context.runId}`;

  try {
    const products = await createTable(baseId, {
      name: productsName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: PRICE_FIELD, type: FieldType.Number },
      ],
      records: [{ fields: { [NAME_FIELD]: "apple", [PRICE_FIELD]: 10 } }],
    });
    tableIds.push(products.id);
    const orders = await createTable(baseId, {
      name: `${config.tableNamePrefix}-orders-${context.runId}`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    tableIds.push(orders.id);
    const priceId = products.fields.find(
      (field: { name: string }) => field.name === PRICE_FIELD,
    )?.id;
    if (!priceId) {
      throw new Error(`table ${products.id} has no ${PRICE_FIELD} column`);
    }
    const create = (body: Record<string, unknown>) =>
      rawRequest<{ id?: string; name?: string }>(
        "POST",
        `/table/${orders.id}/field`,
        body,
      );

    // The link is setup for the three columns that follow it; its own name
    // is checked with theirs.
    const link = await create({
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyMany,
        foreignTableId: products.id,
      },
    });
    if (!isSuccess(link) || !link.data?.id) {
      throw new Error(`creating the link answered ${describeResponse(link)}`);
    }
    assertServedByV2(link.headers, {
      operation: "POST /table/{tableId}/field",
      feature: "createField",
    });
    const lookupOptions = {
      linkFieldId: link.data.id,
      foreignTableId: products.id,
      lookupFieldId: priceId,
    };

    const probe = await bugCheckpoint(
      "unnamed-computed-columns-get-their-usual-names",
      async () => {
        const columns: [string, Record<string, unknown>, string][] = [
          [
            "lookup",
            { type: FieldType.Number, isLookup: true, lookupOptions },
            `${PRICE_FIELD} (from ${productsName})`,
          ],
          [
            "rollup",
            {
              type: FieldType.Rollup,
              options: { expression: "sum({values})" },
              lookupOptions,
            },
            `${PRICE_FIELD} Rollup (from ${productsName})`,
          ],
          [
            "conditional rollup",
            {
              type: FieldType.ConditionalRollup,
              options: {
                foreignTableId: products.id,
                lookupFieldId: priceId,
                expression: "sum({values})",
                filter: {
                  conjunction: "and",
                  filterSet: [
                    { fieldId: priceId, operator: "isGreater", value: 0 },
                  ],
                },
              },
            },
            `${PRICE_FIELD} Reference (${productsName})`,
          ],
          [
            "formula",
            { type: FieldType.Formula, options: { expression: "1+1" } },
            config.formulaName,
          ],
        ];
        const names: Record<string, unknown> = { link: link.data?.name };
        const wrong: string[] = [];
        if (link.data?.name !== productsName) {
          wrong.push(
            `link is named ${JSON.stringify(link.data?.name)}, expected ${JSON.stringify(productsName)}`,
          );
        }
        for (const [label, body, expected] of columns) {
          const created = await create(body);
          if (!isSuccess(created)) {
            wrong.push(
              `creating the ${label} answered ${describeResponse(created)}`,
            );
            continue;
          }
          names[label] = created.data?.name;
          if (created.data?.name !== expected) {
            wrong.push(
              `${label} is named ${JSON.stringify(created.data?.name)}, expected ${JSON.stringify(expected)}`,
            );
          }
        }
        if (wrong.length > 0) {
          throw new Error(wrong.join("; "));
        }
        return names;
      },
    );

    return { details: { names: probe } };
  } finally {
    await dropTables(bugCase.id, baseId, tableIds, permanentDeleteTable);
  }
};
