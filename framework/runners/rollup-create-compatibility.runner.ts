import { Colors, FieldType, Relationship } from "@teable/core";
import {
  axios,
  CREATE_FIELD,
  GET_FIELD_LIST,
  urlBuilder,
} from "@teable/openapi";
import { createTable, permanentDeleteTable } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RollupCreateCompatibilityCaseConfig } from "../types";

// A totalling column asked for a total its source cannot give - the average of
// a tickbox, the sum of a button - sent straight to the API -> checkpoint: the
// request is refused and no column is left behind.
//
// The field editor never offers these combinations: it knows which functions
// each source type supports and hides the rest. The API took them anyway and
// answered 201. What it created was a column with no working source: it read
// 0.00 on every row, its editor opened with the source box empty and nothing
// selectable in it, and there was no way to correct it - only to delete it and
// start again. Automations and integrations, which reach the API directly and
// never see the editor, are how these get written.
//
// So the observation is two things at once, and both matter. The request must
// be refused, and the column must not be there afterwards: a 4xx that still
// persisted the field would leave exactly the mess the report is about.
//
// The same shape twice, on one runner: `rollup` totals across a link,
// `conditionalRollup` totals across a match. Different code paths, one
// question - does the API check what the editor checks.

const HOST_LABEL_FIELD = "Label";
const MATCH_KEY_FIELD = "MatchKey";
const AMOUNT_FIELD = "Amount";
const FLAG_FIELD = "Flag";
const BUTTON_FIELD = "Action";
const LINK_FIELD = "Children";
const LEGAL_FIELD = "A total that is allowed";
const ILLEGAL_FIELD_PREFIX = "A total that is not allowed:";

type Source = RollupCreateCompatibilityCaseConfig["attempts"][number]["source"];

const sourceFieldName: Record<Source, string> = {
  number: AMOUNT_FIELD,
  checkbox: FLAG_FIELD,
  button: BUTTON_FIELD,
};

interface FieldSummary {
  id: string;
  name: string;
}

export const runRollupCreateCompatibilityCase = async (
  bugCase: BugCaseFor<"rollup-create-compatibility">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RollupCreateCompatibilityCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  const createdTableIds: string[] = [];

  if (config.attempts.length === 0) {
    throw new Error(
      "no combinations to attempt - the checkpoint would assert nothing and pass on every column",
    );
  }

  const createFieldRaw = (tableId: string, body: unknown) =>
    axios.post(urlBuilder(CREATE_FIELD, { tableId }), body, {
      // The status is left open because the request under test is refused
      // after the fix, and the generated client throws on a non-2xx and
      // drops the response - routing headers and body with it.
      validateStatus: () => true,
    });

  const listFields = async (tableId: string): Promise<FieldSummary[]> => {
    const response = await axios.get<FieldSummary[]>(
      urlBuilder(GET_FIELD_LIST, { tableId }),
    );
    return response.data;
  };

  try {
    // The other table: one column of each kind a total could be asked for.
    const foreign = await createTable(baseId, {
      name: `${suffix}-source`,
      fields: [
        { name: MATCH_KEY_FIELD, type: FieldType.SingleLineText },
        { name: AMOUNT_FIELD, type: FieldType.Number },
        { name: FLAG_FIELD, type: FieldType.Checkbox },
        {
          name: BUTTON_FIELD,
          type: FieldType.Button,
          options: { label: "Run", color: Colors.Teal },
        },
      ],
      records: [{ fields: { [MATCH_KEY_FIELD]: config.matchKey } }],
    });
    createdTableIds.unshift(foreign.id);

    const foreignFieldId = (name: string) => {
      const found = foreign.fields.find(
        (field: { name: string }) => field.name === name,
      )?.id;
      if (!found) {
        throw new Error(`the source table has no "${name}" column`);
      }
      return found as string;
    };

    // The table the total would live on.
    const host = await createTable(baseId, {
      name: `${suffix}-host`,
      fields: [{ name: HOST_LABEL_FIELD, type: FieldType.SingleLineText }],
      records: [{ fields: { [HOST_LABEL_FIELD]: config.matchKey } }],
    });
    createdTableIds.unshift(host.id);

    // The one column the host still needs, added through the same endpoint the
    // checkpoint uses: a link for the rollup to follow, a match key for the
    // conditional rollup to match on. Asserting the engine HERE is asserting it
    // on the request under test - same route, same feature - while a routing
    // failure still reads as "the case could not run" rather than as the bug.
    const setupField =
      config.column === "rollup"
        ? await createFieldRaw(host.id, {
            name: LINK_FIELD,
            type: FieldType.Link,
            options: {
              relationship: Relationship.OneMany,
              foreignTableId: foreign.id,
            },
          })
        : await createFieldRaw(host.id, {
            name: MATCH_KEY_FIELD,
            type: FieldType.SingleLineText,
          });
    if (setupField.status !== 201) {
      throw new Error(
        `the fixture column was refused (${setupField.status}): ${JSON.stringify(setupField.data)}`,
      );
    }
    const routing = assertServedByV2(setupField.headers, {
      operation: "POST /table/{tableId}/field",
      feature: "createField",
    });
    const setupFieldId = (setupField.data as FieldSummary).id;

    // The legal total, built the same way out of the same pieces. It exists to
    // rule out the reading that makes this case worthless: an endpoint that
    // refuses every total would answer 4xx to the checkpoint too, and look
    // like the fix.
    const legalBody =
      config.column === "rollup"
        ? {
            name: LEGAL_FIELD,
            type: FieldType.Rollup,
            options: { expression: "sum({values})" },
            lookupOptions: {
              foreignTableId: foreign.id,
              linkFieldId: setupFieldId,
              lookupFieldId: foreignFieldId(AMOUNT_FIELD),
            },
          }
        : {
            name: LEGAL_FIELD,
            type: FieldType.ConditionalRollup,
            options: {
              foreignTableId: foreign.id,
              lookupFieldId: foreignFieldId(AMOUNT_FIELD),
              expression: "sum({values})",
              filter: {
                conjunction: "and",
                filterSet: [
                  {
                    fieldId: foreignFieldId(MATCH_KEY_FIELD),
                    operator: "is",
                    value: { type: "field", fieldId: setupFieldId },
                  },
                ],
              },
            },
          };
    const legal = await createFieldRaw(host.id, legalBody);
    if (legal.status !== 201) {
      throw new Error(
        `a legal ${config.column} was refused (${legal.status}), so a refusal in the checkpoint would prove nothing: ${JSON.stringify(legal.data)}`,
      );
    }

    const illegalBody = (source: Source, expression: string, name: string) =>
      config.column === "rollup"
        ? {
            name,
            type: FieldType.Rollup,
            options: { expression },
            lookupOptions: {
              foreignTableId: foreign.id,
              linkFieldId: setupFieldId,
              lookupFieldId: foreignFieldId(sourceFieldName[source]),
            },
          }
        : {
            name,
            type: FieldType.ConditionalRollup,
            options: {
              foreignTableId: foreign.id,
              lookupFieldId: foreignFieldId(sourceFieldName[source]),
              expression,
              filter: {
                conjunction: "and",
                filterSet: [
                  {
                    fieldId: foreignFieldId(MATCH_KEY_FIELD),
                    operator: "is",
                    value: { type: "field", fieldId: setupFieldId },
                  },
                ],
              },
            },
          };

    const probe = await bugCheckpoint(
      "a-total-its-source-cannot-give-is-refused-and-leaves-nothing",
      async () => {
        const observed: Record<string, unknown>[] = [];
        for (const attempt of config.attempts) {
          const name = `${ILLEGAL_FIELD_PREFIX} ${attempt.name}`;
          const response = await createFieldRaw(
            host.id,
            illegalBody(attempt.source, attempt.expression, name),
          );

          if (response.status < 400 || response.status > 499) {
            throw new Error(
              `${attempt.source} + ${attempt.expression} was accepted with ${response.status}, ` +
                `expected the request to be refused. The response was ${JSON.stringify(response.data)}`,
            );
          }

          // The other half: refused AND not there. A 4xx that still wrote the
          // row would leave the unusable column the report is about.
          const fields = await listFields(host.id);
          const persisted = fields.find((field) => field.name === name);
          if (persisted) {
            throw new Error(
              `${attempt.source} + ${attempt.expression} was refused with ${response.status} ` +
                `but the column was created anyway as ${persisted.id}. The table now holds: ` +
                JSON.stringify(fields.map((field) => field.name)),
            );
          }

          observed.push({
            attempt: attempt.name,
            status: response.status,
          });
        }
        return { observed };
      },
    );

    return {
      details: {
        column: config.column,
        hostTableId: host.id,
        sourceTableId: foreign.id,
        routing,
        refused: probe.observed,
      },
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
