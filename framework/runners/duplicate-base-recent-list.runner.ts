import {
  createBase,
  duplicateBase as apiDuplicateBase,
  getUserLastVisitListBase as apiGetRecentBases,
  permanentDeleteBase,
} from "@teable/openapi";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { DuplicateBaseRecentListCaseConfig } from "../types";

// Duplicate a base -> checkpoint: the copy is in the list of bases recently
// opened, at the top.
//
// Duplicating a base is what people do before trying something they are not
// sure about. The copy is the thing they are about to work in, so the place
// they look for it next is the same place they look for everything they were
// just working in.
//
// It was not there at all - not listed late, absent. To someone who has just
// pressed duplicate and is looking at a list that does not mention it, the
// copy did not get made. The next move is to press duplicate again, which
// makes a second copy that is also not there.
//
// The case asserts both that the copy is listed and that it is first, because
// "recently opened" that does not have the thing you just opened at the front
// is a list nobody can use.

export const runDuplicateBaseRecentListCase = async (
  bugCase: BugCaseFor<"duplicate-base-recent-list">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: DuplicateBaseRecentListCaseConfig = bugCase.config;
  const spaceId = globalThis.testConfig.spaceId;
  let sourceBaseId = "";
  let copyId = "";

  try {
    const source = await createBase({
      spaceId,
      name: `${config.baseNamePrefix}-source-${context.runId}`,
    });
    sourceBaseId = source.data.id;

    // Fixture verification, outside the checkpoint: the list answers at all,
    // and does not already carry a base by the copy's name. A list that came
    // back empty for its own reasons would make the checkpoint report the
    // wrong thing.
    const copyName = `${config.baseNamePrefix}-copy-${context.runId}`;
    const before = await apiGetRecentBases();
    if (!Array.isArray(before.data.list)) {
      throw new Error(
        `the list of recently opened bases came back as ${JSON.stringify(before.data)}`,
      );
    }
    if (
      before.data.list.some(
        (item: { resource: { name?: string } }) =>
          item.resource?.name === copyName,
      )
    ) {
      throw new Error(
        `a base named ${JSON.stringify(copyName)} is already in the list - the fixture is not in place`,
      );
    }

    const probe = await bugCheckpoint(
      "a-freshly-duplicated-base-is-in-the-recent-list",
      async () => {
        const duplicated = await apiDuplicateBase({
          fromBaseId: sourceBaseId,
          spaceId,
          name: copyName,
          withRecords: false,
        });
        copyId = duplicated.data.id;
        if (!copyId) {
          throw new Error(
            `duplicating the base produced no copy: ${JSON.stringify(duplicated.data)}`,
          );
        }

        const listed = await apiGetRecentBases();
        const ids = (listed.data.list ?? []).map(
          (item: { resource: { id: string } }) => item.resource.id,
        );
        if (!ids.includes(copyId)) {
          throw new Error(
            `the copy is not in the list of recently opened bases at all: ${JSON.stringify(ids)} - ` +
              "to the person who just pressed duplicate, the copy did not get made",
          );
        }
        if (ids[0] !== copyId) {
          throw new Error(
            `the copy is in the list but not at the front: ${JSON.stringify(ids)} - ` +
              "a recently-opened list without the thing just opened at the front is a list nobody can use",
          );
        }
        return { ids };
      },
    );

    return {
      details: {
        sourceBaseId,
        copyId,
        recentBases: probe.ids,
      },
    };
  } finally {
    for (const id of [copyId, sourceBaseId]) {
      if (!id) {
        continue;
      }
      try {
        await permanentDeleteBase(id);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (base ${id}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
