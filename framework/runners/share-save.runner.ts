import {
  BaseNodeResourceType,
  copyBaseShare,
  createBaseNode,
  createBaseShare,
  getBaseNodeList,
  updateBaseShare,
} from "@teable/openapi";
import { createBase, permanentDeleteBase } from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import type { BugCaseFor, BugProbeResult, BugRunContext } from "../types";
import type { ShareSaveCaseConfig } from "../types";

// Build a share of a single folder -> prove the target base does not own that
// folder name yet -> checkpoint: save the same share into that same base N
// times and prove every save both answered 200 and became visible, with the
// names deduplicated the way the product deduplicates everywhere else.
//
// A folder and nothing else is the fixture on purpose. The copy path writes
// base_node rows with raw SQL and emits no per-resource events, so a table in
// the share would emit a TABLE_CREATE that flushes the target base's node-list
// cache incidentally - and the "saved but invisible" half of this bug would
// hide behind that flush. With folders only, the cache is flushed by the copy
// path itself or not at all.

// The name the product hands the Nth copy of a name that is already taken: the
// first keeps the original, every later one gets " <n>" appended. Mirrors
// getUniqName in @teable/core, which is what every other copy path uses.
const expectedFolderNames = (name: string, saveCount: number): string[] =>
  Array.from({ length: saveCount }, (_, index) =>
    index === 0 ? name : `${name} ${index + 1}`,
  ).sort();

const readFolderNames = async (
  baseId: string,
  folderName: string,
): Promise<string[]> => {
  const nodes = await getBaseNodeList(baseId);
  return nodes.data
    .filter(
      (node: { resourceType: string; resourceMeta?: { name?: string } }) =>
        node.resourceType === BaseNodeResourceType.Folder &&
        (node.resourceMeta?.name ?? "").startsWith(folderName),
    )
    .map(
      (node: { resourceMeta?: { name?: string } }) =>
        node.resourceMeta?.name ?? "<unnamed>",
    )
    .sort();
};

type SaveOutcome = {
  save: number;
  status?: number;
  error?: string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

export const runShareSaveCase = async (
  bugCase: BugCaseFor<"share-save">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ShareSaveCaseConfig = bugCase.config;
  const spaceId = globalThis.testConfig.spaceId;
  const expected = expectedFolderNames(config.folderName, config.saveCount);
  let sourceBaseId = "";
  let targetBaseId = "";

  try {
    const sourceBase = await createBase({
      name: `${config.baseNamePrefix}-source-${context.runId}`,
      spaceId,
    });
    sourceBaseId = sourceBase.id;

    const folder = await createBaseNode(sourceBaseId, {
      resourceType: BaseNodeResourceType.Folder,
      name: config.folderName,
    });
    const share = await createBaseShare(sourceBaseId, {
      nodeId: folder.data.id,
    });
    const shareId = share.data.shareId;
    // Saving a share into another base is what this case is about, and it is
    // off by default - a share created without it would make every save 403
    // and the case would never reach its question.
    await updateBaseShare(sourceBaseId, shareId, { allowSave: true });

    const targetBase = await createBase({
      name: `${config.baseNamePrefix}-target-${context.runId}`,
      spaceId,
    });
    targetBaseId = targetBase.id;

    // Fixture verification, deliberately outside the checkpoint. Reading the
    // list here does double duty: it proves the target base starts without any
    // folder of this name - otherwise "the saved folders showed up" would be
    // unaskable - and it warms the node-list cache, which is the only state a
    // copy that forgets to flush it can keep serving stale.
    const before = await readFolderNames(targetBaseId, config.folderName);
    if (before.length > 0) {
      throw new Error(
        `Target base ${targetBaseId} already owns folders named like "${config.folderName}": [${before.join(", ")}]`,
      );
    }

    const { outcomes, observedNames } = await bugCheckpoint(
      "repeated-save-into-same-base-lands",
      async () => {
        const collected: SaveOutcome[] = [];
        // Every save is recorded rather than thrown on: which save broke, and
        // with what status, is the most useful fact when this fails, and
        // throwing on the first bad one discards the rest of the sequence.
        for (let save = 1; save <= config.saveCount; save += 1) {
          try {
            const response = await copyBaseShare(shareId, {
              spaceId,
              withRecords: false,
              baseId: targetBaseId,
            });
            collected.push({ save, status: response.status });
          } catch (error) {
            collected.push({
              save,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const failed = collected.filter(
          (outcome) => outcome.error !== undefined || outcome.status !== 200,
        );
        if (failed.length > 0) {
          throw new Error(
            `saving the same share into base ${targetBaseId} failed at ${failed
              .map(
                (outcome) =>
                  `save ${outcome.save} (${outcome.error ?? `status ${outcome.status}`})`,
              )
              .join(", ")}`,
          );
        }

        // The cache flush runs after the copy has already answered, so the
        // list is polled rather than read once. A save that never becomes
        // visible fails here by timing out, which is exactly the shape the
        // user sees: "it said it worked and the base looks unchanged".
        const deadline = Date.now() + config.settleTimeoutMs;
        let seen: string[] = [];
        for (;;) {
          seen = await readFolderNames(targetBaseId, config.folderName);
          if (seen.join(" ") === expected.join(" ")) {
            return { outcomes: collected, observedNames: seen };
          }
          if (Date.now() >= deadline) {
            break;
          }
          await sleep(config.settlePollIntervalMs);
        }

        throw new Error(
          `after ${config.saveCount} saves the target base shows folders [${seen.join(", ")}], expected [${expected.join(", ")}] within ${config.settleTimeoutMs}ms`,
        );
      },
    );

    return {
      details: {
        sourceBaseId,
        targetBaseId,
        folderName: config.folderName,
        saveCount: config.saveCount,
        expectedFolderNames: expected,
        observedFolderNames: observedNames,
        saves: outcomes,
      },
    };
  } finally {
    for (const baseId of [targetBaseId, sourceBaseId]) {
      if (!baseId) {
        continue;
      }
      try {
        await permanentDeleteBase(baseId);
      } catch (error) {
        // Cleanup is the case's own housekeeping - the product did not fail.
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (base ${baseId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
