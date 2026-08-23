import { Colors, FieldKeyType, FieldType, RatingIcon } from "@teable/core";
import { getRecords as apiGetRecords } from "@teable/openapi";
import {
  convertField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RatingConversionCaseConfig } from "../types";

// A number column holding values a rating cannot represent -> convert it to a
// rating field -> checkpoint: every cell holds a value inside the field's own
// domain.
//
// A rating field is whole stars between one and its maximum. Converting a
// column into one has to answer for every value already in it: a fraction, a
// number past the maximum, a zero. v1 normalized them; v2's conversion left
// several as they were, so the column ended up holding values it advertises as
// impossible - and everything downstream that trusts the domain, filters and
// comparisons included, disagrees with the stars the grid draws.
//
// This is the conversion side of the same question `record/rating-is-stored-
// in-whole-stars` asks about writes. A field can acquire a bad value either
// way, and the two paths were fixed separately.

const NAME_FIELD = "Name";
const SCORE_FIELD = "Score";

export const runRatingConversionCase = async (
  bugCase: BugCaseFor<"rating-conversion">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RatingConversionCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const suffix = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  const outOfDomain = config.rows.filter(
    (row) =>
      row.before !== null &&
      (!Number.isInteger(row.before) ||
        row.before < 1 ||
        row.before > config.ratingMax),
  );
  if (outOfDomain.length === 0) {
    throw new Error(
      `none of the fixture's values are outside a 1..${config.ratingMax} whole-star domain - ` +
        "the conversion would have nothing to normalize",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: suffix,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
        { name: SCORE_FIELD, type: FieldType.Number },
      ],
      records: config.rows.map((row) => ({
        fields: {
          [NAME_FIELD]: row.name,
          ...(row.before === null ? {} : { [SCORE_FIELD]: row.before }),
        },
      })),
    });
    tableId = table.id;
    const scoreFieldId = table.fields.find(
      (field: { name: string }) => field.name === SCORE_FIELD,
    )?.id;
    if (!scoreFieldId) {
      throw new Error(`Table ${tableId} is not in place`);
    }

    const readScores = async () => {
      const response = await apiGetRecords(tableId, {
        fieldKeyType: FieldKeyType.Name,
        take: config.rows.length,
      });
      return {
        headers: response.headers,
        byName: new Map(
          response.data.records.map(
            (record: { fields: Record<string, unknown> }) => [
              String(record.fields[NAME_FIELD] ?? ""),
              record.fields[SCORE_FIELD] ?? null,
            ],
          ),
        ),
      };
    };

    // Fixture verification, outside the checkpoint: the numbers went in as
    // written. A number column that had already rounded them would leave the
    // conversion nothing to answer for.
    const before = await readScores();
    const routing = assertServedByV2(before.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });
    for (const row of config.rows) {
      const stored = before.byName.get(row.name) ?? null;
      if (JSON.stringify(stored) !== JSON.stringify(row.before)) {
        throw new Error(
          `"${row.name}" holds ${JSON.stringify(stored)} before the conversion, expected ` +
            `${JSON.stringify(row.before)} - the fixture is not in place`,
        );
      }
    }

    const probe = await bugCheckpoint(
      "conversion-normalizes-into-the-rating-domain",
      async () => {
        await convertField(tableId, scoreFieldId, {
          name: SCORE_FIELD,
          type: FieldType.Rating,
          options: {
            max: config.ratingMax,
            icon: RatingIcon.Star,
            color: Colors.YellowBright,
          },
        });

        const after = await readScores();
        const wrong = config.rows
          .map((row) => ({
            name: row.name,
            got: after.byName.get(row.name) ?? null,
            want: row.after,
          }))
          .filter(
            (entry) => JSON.stringify(entry.got) !== JSON.stringify(entry.want),
          );
        if (wrong.length > 0) {
          throw new Error(
            `converting to a rating left ${JSON.stringify(wrong)} - a rating field is whole stars between 1 ` +
              `and ${config.ratingMax}, and those values are not in it`,
          );
        }
        return {
          stored: config.rows.map((row) => ({
            name: row.name,
            value: after.byName.get(row.name) ?? null,
          })),
        };
      },
    );

    return {
      details: {
        tableId,
        ratingMax: config.ratingMax,
        routing,
        stored: probe.stored,
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
