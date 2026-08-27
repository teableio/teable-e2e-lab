import { performance } from "node:perf_hooks";
import { writeBugArtifacts, type BugArtifactPayload } from "./artifacts";
import { normalizeBugError, toBugTestFailure } from "./bug-error";
import { withCaseBase } from "./case-base";
import { executeRegisteredRunner } from "./runner-registry";
import { labEngine } from "./engine";
import { resolveVerdict, verdictFailsCi } from "./verdict";
import { BugPresentError } from "./types";
import type { BugCase, BugProbeResult, BugRunContext } from "./types";

// The wrapper that turns a runner's observation into a verdict and an
// artifact. Order matters and is inherited from perf-lab: the artifact is
// written on EVERY path before anything is allowed to reach vitest, so a red
// test always leaves its evidence, and the report job never has to interpret
// an exit code.
export const runBugCase = async (
  bugCase: BugCase,
  appContext: Pick<BugRunContext, "app" | "appUrl" | "cookie">,
) => {
  const startedAt = new Date();
  const started = performance.now();
  const context: BugRunContext = {
    ...appContext,
    runId: process.env.E2E_LAB_RUN_ID ?? `local-${Date.now()}`,
    commitSha: process.env.E2E_LAB_COMMIT_SHA ?? "local",
    engine: labEngine(),
    artifactDir: process.env.E2E_LAB_ARTIFACT_DIR,
  };
  // Default gating: a local or single-commit run is judging "does this bug
  // behave as declared HERE", so status is enforced. The workflow sets this to
  // "false" on every column of a comparison except the newest.
  const gating = process.env.E2E_LAB_GATING !== "false";

  let probe: BugProbeResult | undefined;
  let caught: unknown;
  let caseBaseId: string | undefined;
  // The base is acquired inside the same try the runner runs in, so a failure
  // to get one is caught and reported through the ordinary artifact path
  // instead of escaping as a bare vitest error. See framework/case-base.ts for
  // why every case gets its own.
  try {
    probe = await withCaseBase(
      bugCase.id,
      context.runId,
      appContext.app,
      async (baseId) => {
        caseBaseId = baseId;
        return executeRegisteredRunner(bugCase, context);
      },
    );
  } catch (error) {
    caught = error;
  }

  const observed =
    caught === undefined
      ? "absent"
      : caught instanceof BugPresentError
        ? "present"
        : "error";
  const verdict = resolveVerdict(observed, bugCase.bug.status);

  const payload: BugArtifactPayload = {
    caseId: bugCase.id,
    title: bugCase.title,
    bug: bugCase.bug,
    runId: context.runId,
    commitSha: context.commitSha,
    engine: context.engine,
    appUrl: context.appUrl,
    observed,
    verdict,
    gating,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: performance.now() - started,
    // The base id is stamped even when the case failed: the base is where the
    // evidence is, and on a failure it is the thing someone will want to open.
    details:
      probe?.details || caseBaseId
        ? { ...probe?.details, ...(caseBaseId ? { caseBaseId } : {}) }
        : undefined,
    ...(caught !== undefined ? { error: normalizeBugError(caught) } : {}),
    ...(caught instanceof BugPresentError
      ? {
          reproduction: {
            checkpoint: caught.checkpoint,
            evidence: caught.evidence,
          },
        }
      : {}),
  };

  await writeBugArtifacts(context.artifactDir, payload);

  if (verdict === "unexpected-pass" && gating && context.engine !== "v1") {
    // Good news, routed to a human instead of to the exit code: the metadata
    // flip is a judgment (was it really this bug that got fixed?), and failing
    // the run for good news teaches people to flip status without verifying.
    // Gating column only — an open bug absent on an OLD revision usually means
    // the bug had not been introduced yet, which the comparison table already
    // shows as a transition.
    console.warn(
      `[e2e-lab] ${bugCase.id}: bug ${bugCase.bug.issue} is declared open but did not reproduce ` +
        `on ${context.commitSha.slice(0, 10)}. Confirm the fix and set bug.status to "fixed".`,
    );
  }

  if (verdictFailsCi(verdict, { gating, engine: context.engine })) {
    throw toBugTestFailure(
      caught ??
        new Error(`verdict ${verdict} with nothing caught — harness bug`),
    );
  }
};
