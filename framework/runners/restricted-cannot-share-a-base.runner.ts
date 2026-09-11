import { FieldType, ViewType } from "@teable/core";
import { urlBuilder } from "@teable/openapi";
import { createTable, createView } from "../../../utils/init-app";
import { withRestrictedPerson } from "../authority-matrix";
import { bugCheckpoint } from "../checkpoint";
import { pickRoutingHeaders } from "../engine";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { RestrictedCannotShareABaseCaseConfig } from "../types";

// Somebody a role restricts tries to hand out a link -> checkpoint: refused,
// for the whole base as well as for one view.
//
// Whether somebody may publish part of a base is one of the things a role
// decides, and the two ways of publishing - a link to one view, a link to the
// whole base - are the same decision made about different amounts of data. The
// whole base is the larger one.
//
// Only the view link was checked. The restricted person clicked share on a
// view and was refused, clicked share on the table and got a link: the more
// dangerous of the two was the one that worked. Nothing about the refusal on
// the view suggests the other button behaves differently, so this is found by
// accident if at all.
//
// Both are asked here, in that order, so a run says whether the product is
// consistent rather than only whether one door is shut.

const NAME_FIELD = "Name";
const CREATE_BASE_SHARE = "/base/{baseId}/share";
const ENABLE_SHARE_VIEW = "/table/{tableId}/view/{viewId}/enable-share";
const GET_BASE_NODE_LIST = "/base/{baseId}/node/list";

export const runRestrictedCannotShareABaseCase = async (
  bugCase: BugCaseFor<"restricted-cannot-share-a-base">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: RestrictedCannotShareABaseCaseConfig = bugCase.config;
  const suffix = `${config.namePrefix}-${context.runId}`;
  let person: Awaited<ReturnType<typeof withRestrictedPerson>> | undefined;
  let personBaseId = "";
  let tableId = "";
  let viewId = "";

  try {
    person = await withRestrictedPerson({
      namePrefix: config.namePrefix,
      runId: context.runId,
      // The person joins with a base role that could publish on its own, so a
      // refusal is the matrix deciding rather than the base role.
      join: config.join,
      buildTables: async (baseId) => {
        personBaseId = baseId;
        const table = await createTable(baseId, {
          name: suffix,
          fields: [
            {
              name: NAME_FIELD,
              type: FieldType.SingleLineText,
              isPrimary: true,
            },
          ],
          records: [{ fields: { [NAME_FIELD]: config.rowName } }],
        });
        tableId = table.id;
        const grid = await createView(table.id, {
          name: "A view",
          type: ViewType.Grid,
        });
        viewId = grid.id;
        // The role leaves the table itself alone: this case is about publishing,
        // not about reading.
        return [{ tableId: table.id, disabledActions: [] }];
      },
    });

    // Fixture verification, outside the checkpoint: the person is in the base
    // and can see what is in it. A refusal to publish means something only if
    // they are somebody who belongs there.
    const canSee = await person.axios.get(
      urlBuilder(GET_BASE_NODE_LIST, { baseId: personBaseId }),
      { validateStatus: () => true },
    );
    if (canSee.status !== 200) {
      throw new Error(
        `the restricted person cannot read the base at all (${canSee.status}): ${JSON.stringify(canSee.data)}`,
      );
    }
    const routing = pickRoutingHeaders(canSee.headers);

    const probe = await bugCheckpoint(
      "a-role-that-withholds-sharing-withholds-both-kinds",
      async () => {
        const answers: Record<string, number> = {};

        const view = await person!.axios.post(
          urlBuilder(ENABLE_SHARE_VIEW, { tableId, viewId }),
          {},
          { validateStatus: () => true },
        );
        answers["one view"] = view.status;

        const base = await person!.axios.post(
          urlBuilder(CREATE_BASE_SHARE, { baseId: personBaseId }),
          {},
          { validateStatus: () => true },
        );
        answers["the whole base"] = base.status;
        const baseShareId = (base.data as { shareId?: string })?.shareId;

        const allowed = Object.entries(answers).filter(
          ([, status]) => status >= 200 && status < 300,
        );
        if (allowed.length > 0) {
          throw new Error(
            `the restricted person was refused ${JSON.stringify(answers)} - ${JSON.stringify(
              allowed.map(([what]) => what),
            )} went through` +
              (baseShareId
                ? `, and the base link ${JSON.stringify(baseShareId)} now exists`
                : "") +
              " - the larger of the two ways to publish is the one that worked",
          );
        }
        const unexpected = Object.entries(answers).filter(
          ([, status]) => status !== config.expectedStatus,
        );
        if (unexpected.length > 0) {
          throw new Error(
            `both were refused, but not the way this case expects (${config.expectedStatus}): ${JSON.stringify(answers)}`,
          );
        }
        return { answers };
      },
    );

    return {
      details: {
        baseId: personBaseId,
        tableId,
        viewId,
        answers: probe.answers,
        routing,
      },
    };
  } finally {
    if (person) {
      try {
        await person.cleanUp();
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
