import { FieldKeyType, FieldType } from "@teable/core";
import { GET_RECORDS_URL, axios, urlBuilder } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ProvisionWindowReadRaceCaseConfig } from "../types";

// Somebody is adding columns to a table while other people have it open ->
// checkpoint: nobody's page says the table does not exist.
//
// Adding a column that needs the stored table rebuilt marks the table as being
// worked on and marks it ready again when the rebuild lands. Reads resolve
// tables by "ready", so a read arriving inside that window did not wait - it
// answered "Table not found", which is what a table that was deleted answers.
//
// One column is a narrow window. A person adding several, or an assistant
// adding them in a burst, keeps it almost continuously open, and everybody else
// gets errors on a table that is plainly right there. The reads that fail are
// ordinary ones - the rows of a view, the page reconnecting - and what they
// report is not "busy, try again" but "gone".
//
// The case adds the columns through the public API rather than writing the
// marker itself: the window is the product's own, so a build that opens it for
// longer or shorter is measured as it is, and a build that never opens it makes
// the case green rather than making it lie.

const NAME_FIELD = "Name";

export const runProvisionWindowReadRaceCase = async (
  bugCase: BugCaseFor<"provision-window-read-race">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ProvisionWindowReadRaceCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.columnsToAdd < 2) {
    throw new Error(
      "one column opens the window once - the reported shape is a burst, and a single narrow window is a coin flip",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: Array.from({ length: config.rowCount }, (_, index) => ({
        fields: { [NAME_FIELD]: `row-${index}` },
      })),
    });
    tableId = table.id;

    const readRows = () =>
      axios.get(urlBuilder(GET_RECORDS_URL, { tableId }), {
        params: { fieldKeyType: FieldKeyType.Id, take: config.rowCount },
        validateStatus: () => true,
      });

    // Fixture verification, outside the checkpoint: the table reads the way
    // everyone's page reads it, before anybody starts changing it.
    const seeded = await readRows();
    if (seeded.status !== 200) {
      throw new Error(
        `the table does not read at all before the columns are added (${seeded.status}): ${JSON.stringify(seeded.data)}`,
      );
    }
    assertServedByV2(seeded.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const probe = await bugCheckpoint(
      "a-table-being-changed-does-not-report-itself-missing",
      async () => {
        const failures: { status: number; message: string }[] = [];
        let reads = 0;

        for (let round = 0; round < config.columnsToAdd; round += 1) {
          // The column is added without waiting for it: the window this case is
          // about is open only while it is in flight.
          let adding = true;
          const added = createField(tableId, {
            name: `Extra ${round}`,
            type: FieldType.Formula,
            options: { expression: `{${table.fields[0].id}}` },
          }).finally(() => {
            adding = false;
          });

          while (adding) {
            const batch = await Promise.all(
              Array.from({ length: config.concurrentReads }, () => readRows()),
            );
            reads += batch.length;
            for (const response of batch) {
              if (response.status !== 200) {
                failures.push({
                  status: response.status,
                  message: JSON.stringify(response.data).slice(0, 200),
                });
              }
            }
          }
          await added;
        }

        if (failures.length > 0) {
          const missing = failures.filter((failure) =>
            /not found/i.test(failure.message),
          );
          throw new Error(
            `${failures.length} of ${reads} ordinary reads failed while columns were being added` +
              (missing.length > 0
                ? `, ${missing.length} of them saying the table does not exist: ${JSON.stringify(missing[0])}` +
                  " - which is what a deleted table answers, on a table that is plainly there"
                : `: ${JSON.stringify(failures[0])}`),
          );
        }
        return { reads };
      },
    );

    return {
      details: {
        tableId,
        columnsAdded: config.columnsToAdd,
        readsDuring: probe.reads,
        rows: config.rowCount,
      },
    };
  } finally {
    if (tableId) {
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
