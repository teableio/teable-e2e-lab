import { FieldType } from "@teable/core";
import {
  createBase,
  createSpace,
  createTable,
  permanentDeleteSpace,
} from "../../../utils/init-app";
import { bugCheckpoint } from "../checkpoint";
import { assertServedByV2 } from "../engine";
import type {
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  ConcurrentBasePurgeCaseConfig,
} from "../types";
import { describeResponse, isSuccess, rawRequest, sleep } from "./raw-api";

// A space with two bases, one moved to the trash -> several requests to delete
// that trash item for good, sent at once -> checkpoint: exactly one succeeds,
// the others are told the item is busy or already gone, none fails with a
// server error, a retry finds nothing, and the other base still opens.
//
// The purges raced. The one that lost read the base's details after the winner
// had removed them and failed with a server error halfway through its cleanup.
// Whether the race is lost on a given run depends on timing, so a revision with
// the bug can pass here; a server error is never acceptable.

type TrashItem = { id: string; resourceId?: string };

export const runConcurrentBasePurgeCase = async (
  bugCase: BugCaseFor<"concurrent-base-purge">,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const config: ConcurrentBasePurgeCaseConfig = bugCase.config;
  let spaceId: string | undefined;

  if (config.concurrentPurges < 2) {
    throw new Error("a race needs at least two purges");
  }

  try {
    spaceId = (
      await createSpace({ name: `${config.namePrefix}-${context.runId}` })
    ).id;
    const makeBase = async (name: string) => {
      const base = await createBase({ spaceId: spaceId!, name });
      const tableIds: string[] = [];
      for (let index = 0; index < config.tablesPerBase; index++) {
        const table = await createTable(base.id, {
          name: `${name}-table-${index}`,
          fields: [
            { name: "Name", type: FieldType.SingleLineText, isPrimary: true },
            { name: "Amount", type: FieldType.Number },
          ],
          records: Array.from({ length: config.rowsPerTable }, (_, row) => ({
            fields: { Name: `row-${row}`, Amount: row },
          })),
        });
        tableIds.push(table.id);
      }
      return { baseId: base.id as string, tableIds };
    };
    const target = await makeBase(`${config.namePrefix}-target`);
    const other = await makeBase(`${config.namePrefix}-other`);

    // The purge cleans up what the v2 engine keeps for the base, so the base
    // has to have been served by v2 in the first place.
    const read = await rawRequest(
      "GET",
      `/table/${target.tableIds[0]}/record?take=1`,
    );
    if (!isSuccess(read)) {
      throw new Error(
        `reading the target base answered ${describeResponse(read)}`,
      );
    }
    const routing = assertServedByV2(read.headers, {
      operation: "GET /table/{tableId}/record",
      feature: "getRecords",
    });

    const moved = await rawRequest("DELETE", `/base/${target.baseId}`);
    if (!isSuccess(moved)) {
      throw new Error(
        `moving the base to the trash answered ${describeResponse(moved)}`,
      );
    }
    let item: TrashItem | undefined;
    for (let attempt = 0; attempt < config.trashAttempts && !item; attempt++) {
      const listed = await rawRequest<{ trashItems?: TrashItem[] }>(
        "GET",
        `/trash?spaceId=${spaceId}&resourceType=base`,
      );
      item = listed.data.trashItems?.find(
        (candidate) => candidate.resourceId === target.baseId,
      );
      if (!item) {
        await sleep(config.trashIntervalMs);
      }
    }
    if (!item) {
      throw new Error("the deleted base never appeared in the trash");
    }
    const trashId = item.id;

    const probe = await bugCheckpoint(
      "only-one-purge-wins-and-none-fails",
      async () => {
        const answers = await Promise.all(
          Array.from({ length: config.concurrentPurges }, () =>
            rawRequest("DELETE", `/trash/${trashId}`),
          ),
        );
        const statuses = answers.map((answer) => answer.status);
        const problems: string[] = [];
        const serverErrors = answers.filter((answer) => answer.status >= 500);
        if (serverErrors.length > 0) {
          problems.push(
            `${serverErrors.length} purges failed with a server error: ${describeResponse(serverErrors[0])}`,
          );
        }
        const won = statuses.filter((status) => status === 200).length;
        if (won !== 1) {
          problems.push(`${won} purges succeeded, expected exactly one`);
        }
        const unexpected = statuses.filter(
          (status) =>
            status !== 200 && status !== 409 && status !== 404 && status < 500,
        );
        if (unexpected.length > 0) {
          problems.push(`unexpected answers ${JSON.stringify(unexpected)}`);
        }
        const retry = await rawRequest("DELETE", `/trash/${trashId}`);
        if (retry.status !== 404) {
          problems.push(
            `a retry afterwards answered ${describeResponse(retry)}, expected 404`,
          );
        }
        const stillThere = await rawRequest(
          "GET",
          `/base/${other.baseId}/table/${other.tableIds[0]}`,
        );
        if (!isSuccess(stillThere)) {
          problems.push(
            `the other base no longer opens: ${describeResponse(stillThere)}`,
          );
        }
        if (problems.length > 0) {
          throw new Error(
            `${problems.join("; ")} (answers ${JSON.stringify(statuses)})`,
          );
        }
        return { statuses, retryStatus: retry.status };
      },
    );

    return { details: { spaceId, routing, ...probe } };
  } finally {
    if (spaceId) {
      try {
        await permanentDeleteSpace(spaceId);
      } catch (error) {
        console.warn(
          `[e2e-lab] cleanup failed for ${bugCase.id} (space ${spaceId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
};
