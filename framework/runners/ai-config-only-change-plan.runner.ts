import { FieldAIActionType, FieldType } from "@teable/core";
import { planFieldConvert as apiPlanFieldConvert } from "@teable/openapi";
import {
  createField,
  createTable,
  permanentDeleteTable,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { fixtureDb } from "../fixture-db";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { AiConfigOnlyChangePlanCaseConfig } from "../types";

// A long-text column with an AI instruction behind it -> change nothing but
// the model and the wording of the instruction -> checkpoint: saving that is
// planned as a change that touches no data.
//
// Before the product rewrites a column it says what the rewrite will cost and
// asks. That warning is the product's own answer to "what will this do", and
// it is only useful while it means something: a warning that appears for a
// change that rewrites nothing teaches people to click through it, and the one
// time it matters they click through that too.
//
// Editing the instruction behind an AI column is exactly that kind of change.
// Nothing is recomputed until the person asks for it; only the wording is
// stored. The editor still asked, because the settings the editor resubmits
// unchanged were being read as a different set of settings than the ones
// stored - a rule about last-modified time was being read into a column that
// has nothing to do with modification time.
//
// The observation is the plan the product returns for the save, which is what
// the dialog is drawn from - not the dialog.
//
// The stored settings are put into their clean shape with SQL: a column made
// while the misreading was live stores the misread shape too, so a column
// created and immediately re-read would compare a wrong thing against the same
// wrong thing and agree.

const NAME_FIELD = "Name";

export const runAiConfigOnlyChangePlanCase = async (
  bugCase: BugCaseFor<"ai-config-only-change-plan">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: AiConfigOnlyChangePlanCaseConfig = bugCase.config;
  const baseId = globalThis.testConfig.baseId;
  const tableName = `${config.tableNamePrefix}-${context.runId}`;
  let tableId = "";

  if (config.newModelKey === config.modelKey) {
    throw new Error(
      "the new model has to differ from the old one, or nothing is being changed",
    );
  }

  try {
    const table = await createTable(baseId, {
      name: tableName,
      fields: [
        { name: NAME_FIELD, type: FieldType.SingleLineText, isPrimary: true },
      ],
      records: [{ fields: { [NAME_FIELD]: "a-row" } }],
    });
    tableId = table.id;

    // The settings the column carries, and the ones the editor will resubmit
    // untouched alongside the new instruction.
    const displaySettings = { showAs: { type: "markdown" } };

    const aiField = await createField(tableId, {
      name: "Reply",
      type: FieldType.LongText,
      options: displaySettings,
      aiConfig: {
        type: FieldAIActionType.Customization,
        modelKey: config.modelKey,
        prompt: config.prompt,
      },
    });

    // Fixture verification, outside the checkpoint: the column is a long-text
    // column carrying an instruction. Without the instruction there would be
    // nothing to edit and the plan would be answering a different question.
    if (aiField.type !== FieldType.LongText) {
      throw new Error(
        `the column is a ${aiField.type}, expected a long-text column`,
      );
    }
    if (aiField.aiConfig?.modelKey !== config.modelKey) {
      throw new Error(
        `the column carries model ${JSON.stringify(aiField.aiConfig?.modelKey)}, expected ${JSON.stringify(config.modelKey)}`,
      );
    }

    // Setup: the stored settings in the shape a column made before the
    // misreading carries - the display setting and nothing else.
    const db = fixtureDb(context.app);
    await db.execute(
      `UPDATE "field" SET "options" = $1 WHERE "id" = $2`,
      JSON.stringify(displaySettings),
      aiField.id,
    );

    const probe = await bugCheckpoint(
      "changing-only-the-instruction-plans-no-rewrite",
      async () => {
        // What the editor sends when a person edits the instruction: the same
        // display setting, a new model and the same wording.
        const planned = await apiPlanFieldConvert(tableId, aiField.id, {
          type: FieldType.LongText,
          options: displaySettings,
          aiConfig: {
            type: FieldAIActionType.Customization,
            modelKey: config.newModelKey,
            prompt: config.prompt,
          },
        });
        const plan = planned.data as Record<string, unknown>;
        if (plan?.skip !== true) {
          throw new Error(
            `saving a new model on the same column is planned as a rewrite: ${JSON.stringify(plan)} - ` +
              "nothing about the column's values changed, so the editor asks the person to confirm work that will not happen",
          );
        }
        return { plan };
      },
    );

    return {
      details: {
        tableId,
        fieldId: aiField.id,
        modelKey: config.modelKey,
        newModelKey: config.newModelKey,
        plan: probe.plan,
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
