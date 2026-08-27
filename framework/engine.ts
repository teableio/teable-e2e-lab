/**
 * Which engine a run asks for, how it gets there, and proof that it answered.
 *
 * v2 is what this lab GUARDS: it is where fixes land, and a bug returning
 * there is a regression someone must act on. v1 is run as a REFERENCE — it
 * answers "what does the engine our older customers are still on do with
 * this?" — and never fails anything (framework/verdict.ts).
 *
 * That split is what makes running both engines safe here. teable-perf-lab's
 * framework/routing.ts, which this is otherwise a port of, asks only "did I
 * get the engine I requested". Copying that alone once reproduced the exact
 * bug it was meant to prevent: pinned to v1, three v2 cases ran, found
 * nothing, and reported green. So the v2 assertion below stays absolute — on
 * a v2 run, v2 must have answered — and the v1 assertion is its mirror rather
 * than a relaxation.
 *
 * What is worth taking from perf-lab, and is taken:
 *
 *   - Assert on the response to the request the case actually depends on,
 *     never a separate probe. A probe that reaches v2 while the operation
 *     under test quietly does not is the shape this exists to catch.
 *   - Assert the FEATURE, not just the engine. `x-teable-v2-feature` names
 *     which v2 path answered; a case whose bug lives in getRecords learns
 *     nothing from "some v2 endpoint works".
 *   - Return the whole routing record so the artifact can answer "what served
 *     this row" months later without anyone re-deriving it.
 *
 * Header names are literals rather than imports from the backend: they are a
 * wire contract that has outlived several refactors of the module emitting
 * them, and a moved import path would break the whole spec on older commits
 * instead of just this assertion.
 */

export type LabEngine = "v1" | "v2";

// Read LIVE, never captured into a module constant.
//
// The spec runs one engine block after another in the same process, so a
// constant read at import time would pin every later block to whichever engine
// happened to be first — and the failure would be silent: the v1 block would
// quietly report v2's answers under v1's name. The routing assertion below
// would catch it, but only because it too reads live. Defaults to v2, the
// guarded engine.
export const labEngine = (): LabEngine =>
  process.env.E2E_LAB_ENGINE === "v1" ? "v1" : "v2";

export interface RoutingHeaders {
  "x-teable-v2": string;
  "x-teable-v2-feature": string;
  "x-teable-v2-reason": string;
}

export interface EngineRouting {
  engine: string;
  feature: string;
  expectedFeature?: string;
  reason: string;
}

// Called before each engine's app boots. FORCE_V2_ALL is read live per
// request, but some paths also read it at startup, so it is set explicitly.
//
// Turning it off is necessary to reach v1 and NOT sufficient: the router asks
// FORCE_V2_ALL first and the base's own v2 flag second, and every base the
// product creates is stamped v2. Unstamping it is framework/case-base.ts's
// job, and without that step a "v1" run is a second v2 run wearing a label —
// measured 2026-08-27, 129 cases, not one observation different.
export const applyEngineRuntimeEnv = (engine: LabEngine = labEngine()) => {
  process.env.FORCE_V2_ALL = engine === "v2" ? "true" : "false";
};

// Genuinely case-insensitive, not just "try the lowercase spelling too": HTTP
// header names are case-insensitive, axios happens to hand them over
// lowercased, and a helper that quietly depends on that would fail open — the
// header would read as absent and, before the assertion below, absent looked
// exactly like v1.
const headerValue = (headers: Record<string, unknown>, name: string) => {
  const wanted = name.toLowerCase();
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === wanted,
  );
  const value = match?.[1];
  return Array.isArray(value) ? String(value[0]) : String(value ?? "");
};

export const pickRoutingHeaders = (
  headers: Record<string, unknown>,
): RoutingHeaders => ({
  "x-teable-v2": headerValue(headers, "x-teable-v2"),
  "x-teable-v2-feature": headerValue(headers, "x-teable-v2-feature"),
  "x-teable-v2-reason": headerValue(headers, "x-teable-v2-reason"),
});

/**
 * Assert a response came from v2, and from the feature the runner named.
 *
 * Call this from a runner's SETUP phase, on a response the case genuinely
 * depends on. Failing in setup is an error verdict (💥, the case could not
 * run), so "the lab asked the wrong engine" can never be read as "the bug is
 * gone" — which is exactly what happened before this existed: two v2 cases
 * passed on their own pre-fix commits, four columns of green.
 *
 * On a v1 run the name still reads right: it asserts the run got the engine it
 * asked for. Runners call it unchanged.
 */
export const assertServedByV2 = (
  headers: Record<string, unknown>,
  options: { feature?: string; operation: string },
): EngineRouting => {
  const routing = pickRoutingHeaders(headers);
  const engine = routing["x-teable-v2"];
  const feature = routing["x-teable-v2-feature"];

  // The v1 mirror. Not a relaxation of the check below: a v1 run answered by
  // v2 is a fabricated reference column, which is worse than no column, so it
  // throws just as hard. What it does not do is demand a feature header — that
  // header is a v2 concept and its absence on v1 is the expected answer.
  if (labEngine() === "v1") {
    if (engine === "true") {
      throw new Error(
        `${options.operation} was requested of v1 but v2 answered ` +
          `(reason=${routing["x-teable-v2-reason"] || "(none)"}). ` +
          "The base was not unstamped; see framework/case-base.ts.",
      );
    }
    return {
      engine,
      feature,
      expectedFeature: options.feature,
      reason: routing["x-teable-v2-reason"],
    };
  }

  if (engine !== "true") {
    throw new Error(
      `${options.operation} was not served by v2 (x-teable-v2=${engine || "(none)"}, ` +
        `reason=${routing["x-teable-v2-reason"] || "(none)"}). ` +
        "Every case here guards v2; a v1 answer is a different question.",
    );
  }

  if (options.feature && feature !== options.feature) {
    throw new Error(
      `${options.operation} was served by v2 but by the wrong feature: ` +
        `expected x-teable-v2-feature=${options.feature}, got ${feature || "(none)"}. ` +
        "The case would be watching code its bug does not live in.",
    );
  }

  return {
    engine,
    feature,
    expectedFeature: options.feature,
    reason: routing["x-teable-v2-reason"],
  };
};
