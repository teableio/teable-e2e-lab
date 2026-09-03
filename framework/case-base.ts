import { AsyncLocalStorage } from "node:async_hooks";
import { createBase, permanentDeleteBase } from "../../utils/init-app";

/**
 * A base of its own for every case.
 *
 * Cases used to share the one base the e2e seed creates. That works only while
 * every case leaves the base as it found it — and this lab's cases are the ones
 * that cannot promise that. A case reproduces its bug by putting the product
 * into a state the product refuses to handle, and the teardown it would use to
 * clean up runs through that same product. The better a case reproduces, the
 * more certainly its own teardown fails.
 *
 * That is not a hypothetical. On teable-ee `ddfd3c0a5`, the T6911 case leaves a
 * rollup field without its expression behind, its `permanentDeleteTable` fails,
 * and eight later cases — testing unrelated things, with their own fixes long
 * since shipped — reported their bugs as reproduced. Two of the ten reds in
 * that run were real. Run 32802739081. With a base per case the same commit
 * reports three: T6911, T6916, and one case whose bug is still declared open.
 *
 * The fix is not a sturdier teardown. It is making teardown not matter: give
 * each case a base nobody else can reach, and a leftover that cannot be
 * deleted has nowhere to spread. The database is dropped at the end of the job
 * regardless, so an abandoned base costs nothing but a row. Deletion below is
 * therefore best-effort by design, not by oversight — it runs so a long local
 * session does not accumulate bases, and a failure is not a problem, which is
 * the whole point of the change.
 *
 * Measured on 106 cases: 83ms mean, 48ms median, added per case.
 */

// Runners read `globalThis.testConfig.baseId` — teable-ee's own convention,
// which 84 of this lab's 94 runners follow. Rather than thread a base id
// through every one of them, the property becomes a view onto whichever case
// is asking.
//
// The obvious implementation, assigning the global before the runner and
// restoring it after, is correct only while exactly one case is in flight.
// Async-local storage costs the same and stays correct when cases overlap, so
// running them concurrently is a scheduling decision rather than a rewrite.
// A read from outside any case still sees the seeded base, which is what
// teable-ee's own helpers expect during app startup.
const caseBaseStore = new AsyncLocalStorage<{ baseId: string }>();

let seededBaseId: string | undefined;

const installBaseIdView = () => {
  if (seededBaseId !== undefined) {
    return;
  }
  seededBaseId = globalThis.testConfig.baseId;
  Object.defineProperty(globalThis.testConfig, "baseId", {
    get: () => caseBaseStore.getStore()?.baseId ?? seededBaseId,
    configurable: true,
    enumerable: true,
  });
};

// The name is only ever read by a human looking at a stuck local database, so
// it carries what such a person needs: which case, and which run.
const caseBaseName = (caseId: string, runId: string) =>
  `e2e-lab/${caseId} @ ${runId}`;

/**
 * Run `body` with a base only this case can reach.
 *
 * Creation happens outside the store, so a failure to get a base surfaces to
 * the caller before the runner starts — a case that cannot be isolated must be
 * reported as broken rather than quietly fall back to the shared base, which is
 * the arrangement this module exists to end.
 */
export const withCaseBase = async <T>(
  caseId: string,
  runId: string,
  body: (baseId: string) => Promise<T>,
): Promise<T> => {
  installBaseIdView();

  const base = await createBase({
    spaceId: globalThis.testConfig.spaceId,
    name: caseBaseName(caseId, runId),
  });

  try {
    return await caseBaseStore.run({ baseId: base.id }, () => body(base.id));
  } finally {
    try {
      await permanentDeleteBase(base.id);
    } catch {
      // Expected on exactly the cases this module protects: the base holds a
      // state the product cannot delete. Nothing downstream depends on it
      // being gone.
    }
  }
};
