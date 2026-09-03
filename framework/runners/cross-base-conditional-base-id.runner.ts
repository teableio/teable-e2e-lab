import { FieldKeyType, FieldType } from "@teable/core";
import {
  axios,
  getRecords as apiGetRecords,
  CREATE_FIELD,
  GET_FIELD_LIST,
  urlBuilder,
} from "@teable/openapi";
import {
  createBase,
  createTable,
  deleteBase,
  permanentDeleteBase,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { CrossBaseConditionalBaseIdCaseConfig } from "../types";

// A conditional column reading a table in ANOTHER base -> open its settings
// again -> checkpoint: the settings still name the base it reads.
//
// A conditional lookup or total needs three things: which table, which column,
// and - when the table is not in this base - which base. The first two were
// stored and the third was dropped, so reopening the column's settings found
// the foreign table with no base to look it up in and drew it as a table the
// person has no permission to see.
//
// Nothing else went wrong. The values kept arriving, because the computation
// had already resolved the table; only the settings could not describe
// themselves any more. What that costs is the ability to change the column: a
// person who opens it sees a permission problem that does not exist, and any
// save from that screen writes back settings with the base already missing.
//
// The values are read outside the checkpoint, before the settings are, and
// that order is deliberate: a column that never computed would also have
// nothing sensible to say about its source, and this case is about a column
// that works.

const CATEGORY_FIELD = "Category";
const AMOUNT_FIELD = "Amount";
const HOST_MATCH_FIELD = "CategoryMatch";
const LOOKUP_FIELD = "Amounts over there";
const ROLLUP_FIELD = "Total over there";

interface FieldSummary {
  id: string;
  name: string;
  options?: Record<string, unknown>;
  lookupOptions?: Record<string, unknown>;
}

export const runCrossBaseConditionalBaseIdCase = async (
  bugCase: BugCaseFor<"cross-base-conditional-base-id">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: CrossBaseConditionalBaseIdCaseConfig = bugCase.config;
  const hostBaseId = globalThis.testConfig.baseId;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let foreignBaseId = "";
  let hostTableId = "";

  try {
    // A second base beside the host's, in the SAME space. Across spaces the
    // product refuses the link outright ("cross-space link is no longer
    // supported"), so the state this case is about only exists inside one.
    const foreignBase = await createBase({
      spaceId: globalThis.testConfig.spaceId,
      name: `${suffix}-other`,
    });
    foreignBaseId = foreignBase.id;

    const foreign = await createTable(foreignBase.id, {
      name: `${suffix}-source`,
      fields: [
        { name: CATEGORY_FIELD, type: FieldType.SingleLineText },
        { name: AMOUNT_FIELD, type: FieldType.Number },
      ],
      records: config.sourceRows.map((row) => ({
        fields: { [CATEGORY_FIELD]: row.category, [AMOUNT_FIELD]: row.amount },
      })),
    });
    const foreignCategoryId = foreign.fields.find(
      (field: { name: string }) => field.name === CATEGORY_FIELD,
    )?.id as string;
    const foreignAmountId = foreign.fields.find(
      (field: { name: string }) => field.name === AMOUNT_FIELD,
    )?.id as string;

    const host = await createTable(hostBaseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_MATCH_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [HOST_MATCH_FIELD]: config.matchedCategory } }],
    });
    hostTableId = host.id;
    const hostMatchId = host.fields.find(
      (field: { name: string }) => field.name === HOST_MATCH_FIELD,
    )?.id as string;
    if (!foreignCategoryId || !foreignAmountId || !hostMatchId) {
      throw new Error("the fixture tables are not in place");
    }

    const matchFilter = {
      conjunction: "and",
      filterSet: [
        {
          fieldId: foreignCategoryId,
          operator: "is",
          value: { type: "field", fieldId: hostMatchId },
        },
      ],
    };

    const createFieldRaw = (body: unknown) =>
      axios.post(urlBuilder(CREATE_FIELD, { tableId: host.id }), body, {
        validateStatus: () => true,
      });

    // The column that reads across the base boundary. Its own create response
    // carries the routing headers, so the engine is asserted on the request
    // that puts the state under test in place rather than on a probe beside it.
    const lookupResponse = await createFieldRaw({
      name: LOOKUP_FIELD,
      type: FieldType.Number,
      isLookup: true,
      isConditionalLookup: true,
      lookupOptions: {
        baseId: foreignBase.id,
        foreignTableId: foreign.id,
        lookupFieldId: foreignAmountId,
        filter: matchFilter,
      },
    });
    if (lookupResponse.status !== 201) {
      throw new Error(
        `the cross-base conditional lookup was refused (${lookupResponse.status}): ${JSON.stringify(lookupResponse.data)}`,
      );
    }
    const routing = assertServedByV2(lookupResponse.headers, {
      operation: "POST /table/{tableId}/field",
      feature: "createField",
    });
    const lookupField = lookupResponse.data as FieldSummary;

    const rollupResponse = await createFieldRaw({
      name: ROLLUP_FIELD,
      type: FieldType.ConditionalRollup,
      options: {
        baseId: foreignBase.id,
        foreignTableId: foreign.id,
        lookupFieldId: foreignAmountId,
        expression: "sum({values})",
        filter: matchFilter,
      },
    });
    if (rollupResponse.status !== 201) {
      throw new Error(
        `the cross-base conditional rollup was refused (${rollupResponse.status}): ${JSON.stringify(rollupResponse.data)}`,
      );
    }
    const rollupField = rollupResponse.data as FieldSummary;

    // Fixture verification, outside the checkpoint: the columns really do read
    // across the boundary. A column that computed nothing would have no source
    // worth asking about.
    const expectedValues = config.sourceRows
      .filter((row) => row.category === config.matchedCategory)
      .map((row) => row.amount);
    if (expectedValues.length === 0) {
      throw new Error(
        `no source row carries "${config.matchedCategory}" - the columns would read empty either way`,
      );
    }
    const rows = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: 1,
    });
    const cell = rows.data.records[0]?.fields[lookupField.id];
    const total = rows.data.records[0]?.fields[rollupField.id];
    if (JSON.stringify(cell) !== JSON.stringify(expectedValues)) {
      throw new Error(
        `the cross-base column reads ${JSON.stringify(cell)}, expected ${JSON.stringify(expectedValues)} - the fixture did not compute`,
      );
    }
    const expectedTotal = expectedValues.reduce((sum, value) => sum + value, 0);
    if (Number(total) !== expectedTotal) {
      throw new Error(
        `the cross-base total reads ${JSON.stringify(total)}, expected ${expectedTotal} - the fixture did not compute`,
      );
    }

    const probe = await bugCheckpoint(
      "a-cross-base-conditional-column-still-names-its-base",
      async () => {
        // What the settings screen loads when it is reopened.
        const listed = await axios.get<FieldSummary[]>(
          urlBuilder(GET_FIELD_LIST, { tableId: host.id }),
        );
        const readBack = (fieldId: string, name: string) => {
          const field = listed.data.find(
            (candidate) => candidate.id === fieldId,
          );
          if (!field) {
            throw new Error(`the ${name} column is gone from the table`);
          }
          return field;
        };

        const lookupBack = readBack(lookupField.id, "conditional lookup");
        const rollupBack = readBack(rollupField.id, "conditional rollup");
        const lookupBaseId = lookupBack.lookupOptions?.baseId;
        const rollupBaseId = rollupBack.options?.baseId;

        if (lookupBaseId !== foreignBase.id) {
          throw new Error(
            `the conditional lookup came back naming base ${JSON.stringify(lookupBaseId)}, ` +
              `expected ${foreignBase.id}. Its whole settings read: ${JSON.stringify(lookupBack.lookupOptions)}`,
          );
        }
        if (rollupBaseId !== foreignBase.id) {
          throw new Error(
            `the conditional rollup came back naming base ${JSON.stringify(rollupBaseId)}, ` +
              `expected ${foreignBase.id}. Its whole settings read: ${JSON.stringify(rollupBack.options)}`,
          );
        }
        return { lookupBaseId, rollupBaseId };
      },
    );

    return {
      details: {
        hostTableId: host.id,
        foreignBaseId: foreignBase.id,
        foreignTableId: foreign.id,
        routing,
        ...probe,
      },
    };
  } finally {
    if (hostTableId) {
      try {
        await permanentDeleteTable(hostBaseId, hostTableId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (table ${hostTableId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    if (foreignBaseId) {
      try {
        await deleteBase(foreignBaseId);
        await permanentDeleteBase(foreignBaseId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (base ${foreignBaseId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
