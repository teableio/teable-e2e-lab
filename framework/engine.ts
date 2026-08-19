/**
 * The engine this lab guards, and proof that it answered.
 *
 * teable-ee is migrating to v2 and v1 bugs are not being fixed. So there is
 * one engine here, not a choice: every case guards v2, and a result measured
 * on v1 is not a weaker result, it is a different question nobody asked.
 *
 * That is the one thing this module does differently from teable-perf-lab's
 * framework/routing.ts, which it is otherwise a port of. perf-lab runs BOTH
 * engines on purpose — comparing them is its job — so its assertion asks "did
 * I get the engine I requested", and v1 answering a v1 request is success.
 * Copying that here reproduced the exact bug it was meant to prevent one level
 * up: pinned to v1, three v2 cases ran, found nothing, and reported green.
 * Here the question is "did v2 answer", full stop.
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

// Stamped into every artifact. A constant today, and deliberately not a
// parameter: the day there is a v3 to guard, this is where that shows up.
export const LAB_ENGINE = "v2";

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

// Called before the app boots. FORCE_V2_ALL is read live per request, but some
// paths also read it at startup, so it is set once for the process.
export const applyEngineRuntimeEnv = () => {
  process.env.FORCE_V2_ALL = "true";
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
 */
export const assertServedByV2 = (
  headers: Record<string, unknown>,
  options: { feature?: string; operation: string },
): EngineRouting => {
  const routing = pickRoutingHeaders(headers);
  const engine = routing["x-teable-v2"];
  const feature = routing["x-teable-v2-feature"];

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
