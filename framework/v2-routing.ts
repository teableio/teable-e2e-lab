import { axios } from "@teable/openapi";

/**
 * Which engine serves a case's requests.
 *
 * teable-ee runs two record engines behind the same API. Which one answers is
 * decided per request, and in the lab's harness the default is v1 — so a case
 * for a v2-only bug asks its question of code that never had the bug, passes
 * on every commit, and reports a green row that means nothing. That is not a
 * hypothetical: the first two v2 cases written here passed on their own
 * pre-fix commits before this module existed.
 *
 * Two things are needed to make such a case honest, and one without the other
 * is worse than neither:
 *
 *   1. Route to v2 — `FORCE_V2_ALL`, read live per request, so flipping the
 *      variable around the case is enough (this is what teable-ee's own v2
 *      specs do).
 *   2. PROVE it routed — every response carries `x-teable-v2`. Asserting it in
 *      the setup phase turns "the mechanism stopped working" into an error
 *      verdict (💥, the case could not run) instead of a silent pass.
 *
 * The header names are written as literals rather than imported from the
 * backend: they are a wire contract that has outlived several refactors of the
 * module that emits them, and a moved import path would break the whole spec
 * on older commits instead of just this assertion.
 */

export const V2_HEADER = "x-teable-v2";
export const V2_FEATURE_HEADER = "x-teable-v2-feature";
export const V2_REASON_HEADER = "x-teable-v2-reason";

// The env var is read per request, so this covers everything the callback does
// without restarting the app.
export const withForcedV2 = async <T>(run: () => Promise<T>): Promise<T> => {
  const previous = process.env.FORCE_V2_ALL;
  process.env.FORCE_V2_ALL = "true";
  try {
    return await run();
  } finally {
    if (previous == null) {
      delete process.env.FORCE_V2_ALL;
    } else {
      process.env.FORCE_V2_ALL = previous;
    }
  }
};

/**
 * Prove the engine under test is actually answering, by asking it something
 * harmless and reading the indicator off the response.
 *
 * Call this from a runner's SETUP phase. Failing here is an error verdict:
 * "this commit cannot be asked the question", which is the honest reading for
 * a revision that predates v2 covering the endpoint — and is exactly what must
 * not be confused with "the bug is absent here".
 */
export const assertV2Routing = async (tableId: string): Promise<string> => {
  const response = await axios.get(`/table/${tableId}/record`, {
    params: { take: 1 },
  });
  const servedByV2 = response.headers[V2_HEADER];
  if (String(servedByV2) !== "true") {
    throw new Error(
      `requests are not being served by v2 (${V2_HEADER}=${String(servedByV2)}, ` +
        `${V2_REASON_HEADER}=${String(response.headers[V2_REASON_HEADER])}) - ` +
        "this case only means something on the v2 path",
    );
  }
  return String(response.headers[V2_REASON_HEADER]);
};
