import { FieldKeyType, FieldType, Relationship } from "@teable/core";
import {
  GET_RECORDS_URL,
  axios,
  getRecords as apiGetRecords,
  urlBuilder,
} from "@teable/openapi";
import {
  createField,
  createRecords,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2, pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ContainsFilterQuoteCaseConfig } from "../types";

// A link column whose linked rows are named "O'Brien" and the like -> filter
// the table to rows whose link contains a value with an apostrophe ->
// checkpoint: the filter answers, with the right rows.
//
// On a column that stores a list - links, people, several choices - "contains"
// was written into the query as text, and an apostrophe in what the person
// typed ended that text early. The request failed with a SQL syntax error, so
// filtering a contact list for O'Brien or it's took the whole view down. The
// same flaw let a crafted value run SQL of its own; this case asks only the
// harmless half: names with apostrophes in them.
//
// A value without an apostrophe is filtered first, outside the checkpoint, as
// the control: the filter itself works, so a failure afterwards is about the
// apostrophe.

const TITLE_FIELD = "Title";
const NAME_FIELD = "Name";
const LINK_FIELD = "Contact";

export const runContainsFilterQuoteCase = async (
  bugCase: BugCaseFor<"contains-filter-quote">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ContainsFilterQuoteCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  const expectedFor = (needle: string) =>
    config.titles.filter((title) => title.includes(needle)).length;
  for (const probe of config.probes) {
    if (!probe.includes("'")) {
      throw new Error(
        `the probe ${JSON.stringify(probe)} has no apostrophe - it would not ask the question`,
      );
    }
  }
  if (config.control.includes("'") || expectedFor(config.control) < 1) {
    throw new Error(
      "the control must match at least one row and hold no apostrophe",
    );
  }

  try {
    const contacts = await createTable(baseId, {
      name: `${suffix}-contacts`,
      fields: [
        { name: TITLE_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: config.titles.map((title) => ({
        fields: { [TITLE_FIELD]: title },
      })),
    });
    createdTableIds.unshift(contacts.id);

    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [],
    });
    createdTableIds.unshift(host.id);
    const link = await createField(host.id, {
      name: LINK_FIELD,
      type: FieldType.Link,
      options: {
        relationship: Relationship.ManyOne,
        foreignTableId: contacts.id,
      },
    });
    await createRecords(host.id, {
      fieldKeyType: FieldKeyType.Name,
      typecast: false,
      records: contacts.records.map(
        (record: { id: string }, index: number) => ({
          fields: {
            [NAME_FIELD]: `row-${index}`,
            [LINK_FIELD]: { id: record.id },
          },
        }),
      ),
    });

    const filterBy = (value: string) => ({
      conjunction: "and",
      filterSet: [{ fieldId: link.id, operator: "contains", value }],
    });

    // Fixture verification, outside the checkpoint: the same filter with a
    // value that holds no apostrophe answers and finds its rows.
    const control = await apiGetRecords(host.id, {
      fieldKeyType: FieldKeyType.Id,
      take: config.titles.length + 1,
      filter: filterBy(config.control) as never,
    });
    const routing = assertServedByV2(control.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    if (control.data.records.length !== expectedFor(config.control)) {
      throw new Error(
        `filtering for ${JSON.stringify(config.control)} returned ${control.data.records.length} rows, ` +
          `expected ${expectedFor(config.control)} - the filter is not working at all`,
      );
    }

    const probe = await bugCheckpoint(
      "a-contains-filter-takes-an-apostrophe",
      async () => {
        const results: { value: string; rows: number }[] = [];
        for (const value of config.probes) {
          // Raw axios with the status open: a refusal is the report, and the
          // generated client throws its message away.
          const response = await axios.get(
            urlBuilder(GET_RECORDS_URL, { tableId: host.id }),
            {
              params: {
                fieldKeyType: FieldKeyType.Id,
                take: config.titles.length + 1,
                filter: JSON.stringify(filterBy(value)),
              },
              validateStatus: () => true,
            },
          );
          if (response.status >= 300) {
            throw new Error(
              `filtering the link column for ${JSON.stringify(value)} answered ${response.status}: ` +
                `${JSON.stringify(response.data)} (routing ${JSON.stringify(pickRoutingHeaders(response.headers))})`,
            );
          }
          const rows = (response.data.records ?? []).length;
          results.push({ value, rows });
          if (rows !== expectedFor(value)) {
            throw new Error(
              `filtering the link column for ${JSON.stringify(value)} returned ${rows} rows, ` +
                `expected ${expectedFor(value)}`,
            );
          }
        }
        return { results };
      },
    );

    return {
      details: { tableIds: createdTableIds, routing, results: probe.results },
    };
  } finally {
    for (const tableId of createdTableIds) {
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
