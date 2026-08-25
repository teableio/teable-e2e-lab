import { AsyncLocalStorage } from "node:async_hooks";
import { BugPresentError } from "./types";
import { normalizeBugError } from "./bug-error";

/**
 * Marks the region of a runner where the bug is OBSERVED, as opposed to the
 * setup around it.
 *
 * The rule is crisp on purpose: anything thrown inside a checkpoint is treated
 * as "the bug reproduced" — a failed assertion, a 500 from the endpoint under
 * test, a timeout waiting for a value that never arrives. All of those are
 * legitimate shapes a bug takes at the point of observation. Anything thrown
 * OUTSIDE every checkpoint is harness/setup trouble and becomes an `error`
 * verdict instead.
 *
 * Without this seam, "the bug is still present" and "the case could not run"
 * collapse into one kind of failure, and the comparison table cannot tell an
 * old revision where the bug lives from an old revision where the fixture API
 * did not exist yet.
 */
// Set while a checkpoint is running, read by the fixture-DB seam so it can
// refuse to hand out a database handle where the bug is being observed.
//
// Async-local rather than a module flag: cases overlap now, and a plain
// boolean answers "is SOME case observing" when the question is "is THIS one".
// The version that got this wrong failed 31 of 106 cases in a single run, all
// of them setup calls refused because an unrelated case happened to be inside
// its checkpoint at the time — and refused as an `error` verdict, which reads
// as a broken case rather than as a harness that cannot count.
const checkpointDepth = new AsyncLocalStorage<number>();

export const isInsideCheckpoint = () => (checkpointDepth.getStore() ?? 0) > 0;

export const bugCheckpoint = async <T>(
  checkpoint: string,
  observe: () => Promise<T> | T,
): Promise<T> => {
  const depth = (checkpointDepth.getStore() ?? 0) + 1;
  try {
    return await checkpointDepth.run(depth, async () => observe());
  } catch (error) {
    if (error instanceof BugPresentError) {
      throw error;
    }
    const normalized = normalizeBugError(error);
    throw new BugPresentError(
      `bug reproduced at checkpoint "${checkpoint}": ${normalized.message}`,
      {
        cause: error,
        checkpoint,
        evidence: {
          ...(normalized.status !== undefined
            ? { status: normalized.status }
            : {}),
          ...(normalized.response !== undefined
            ? { response: normalized.response }
            : {}),
        },
      },
    );
  }
};
