import type { INestApplication } from "@nestjs/common";
import { performance } from "node:perf_hooks";
import { initApp } from "../utils/init-app";
import { getBugCase, resolveBugCaseIds } from "./registry";
import { applyEngineRuntimeEnv, LAB_ENGINE } from "./framework/engine";
import { runBugCase } from "./framework/run-bug-case";

// Before the app boots: pin the engine every case here guards. teable-ee is
// migrating to v2 and v1 bugs are not being fixed, so there is one engine, not
// a choice. See framework/engine.ts.
applyEngineRuntimeEnv();

// The single executable entry point, in the perf-lab mold: this file is copied
// into teable-ee/community/apps/nestjs-backend/test/e2e-lab/ and run through
// teable-ee's own vitest e2e setup, so auth bootstrap, seed user, and Nest app
// startup stay aligned with the harness the product already maintains.
//
// One app, every selected case in registry order, serially. No engine loop and
// no seed/execute mode split — bug fixtures are built and torn down inside
// each case, and the revision under test is whatever this checkout is.

const specStarted = performance.now();

const logPhase = (
  phase: string,
  details: Record<string, string | number | boolean | undefined> = {},
) => {
  const detailText = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.log(
    `[e2e-lab] ${phase} at=${new Date().toISOString()} elapsedMs=${Math.round(
      performance.now() - specStarted,
    )}${detailText ? ` ${detailText}` : ""}`,
  );
};

describe("e2e-lab bug regression runner (e2e)", () => {
  const caseIds = resolveBugCaseIds(process.env.E2E_LAB_CASE_FILTER ?? "all");
  const bugCases = caseIds.map(getBugCase);

  logPhase("module-loaded", {
    cases: caseIds.join(","),
    commitSha: process.env.E2E_LAB_COMMIT_SHA ?? "(local)",
    engine: LAB_ENGINE,
  });

  let app: INestApplication;
  let appUrl: string;
  let cookie: string | undefined;

  beforeAll(async () => {
    const initStarted = performance.now();
    const appCtx = await initApp();
    app = appCtx.app;
    appUrl = appCtx.appUrl;
    cookie = appCtx.cookie;
    logPhase("app-ready", {
      initAppMs: Math.round(performance.now() - initStarted),
      appUrl,
    });
  });

  afterAll(async () => {
    const closeStarted = performance.now();
    await app?.close();
    logPhase("app-closed", {
      closeMs: Math.round(performance.now() - closeStarted),
    });
  });

  for (const bugCase of bugCases) {
    it(
      `observes ${bugCase.id} [${bugCase.bug.issue}]`,
      { timeout: bugCase.timeoutMs },
      async () => {
        logPhase("case:start", { caseId: bugCase.id });
        const caseStarted = performance.now();
        await runBugCase(bugCase, { app, appUrl, cookie });
        logPhase("case:done", {
          caseId: bugCase.id,
          caseMs: Math.round(performance.now() - caseStarted),
        });
      },
    );
  }
});
