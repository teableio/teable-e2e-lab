import type { INestApplication } from "@nestjs/common";
import { performance } from "node:perf_hooks";
import { initApp } from "../utils/init-app";
import { getBugCase, resolveBugCaseIds } from "./registry";
import {
  applyEngineRuntimeEnv,
  LAB_ENGINE,
  labComputedUpdateMode,
} from "./framework/engine";
import { runBugCase } from "./framework/run-bug-case";
import { closeBrowserRuntime } from "./framework/browser-runtime";

// Before the app boots: pin the engine every case here guards. teable-ee is
// migrating to v2 and v1 bugs are not being fixed, so there is one engine, not
// a choice. See framework/engine.ts.
applyEngineRuntimeEnv();

// The single executable entry point, in the perf-lab mold: this file is copied
// into teable-ee/community/apps/nestjs-backend/test/e2e-lab/ and run through
// teable-ee's own vitest e2e setup, so auth bootstrap, seed user, and Nest app
// startup stay aligned with the harness the product already maintains.
//
// One app, every selected case in registry order. No engine loop and no
// seed/execute mode split — bug fixtures are built and torn down inside each
// case, and the revision under test is whatever this checkout is.
//
// API cases overlap, a few at a time. Browser cases stay serial because they
// share one development frontend and each needs its own full timeout for route
// compilation and hydration. Framework/case-base.ts keeps their product data
// isolated, except for user-wide state such as the recent-base list: those
// cases must also run serially. API concurrency lives in vitest-e2e-lab.config.ts.

const specStarted = performance.now();
const serialRunners = new Set([
  "authority-unreadable-group",
  "comment-delete-browser",
  "deleted-table-collaborator-recovery",
  "group-locale-browser",
  // Recent bases belong to the shared user, not the per-case base. Another
  // concurrent case can visit a base between duplication and the list read.
  "duplicate-base-recent-list",
]);

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
  // The computed-update strategy is fixed when this process's app boots
  // (framework/engine.ts), so an invocation can only honestly run the cases
  // that declared its mode. The others are excluded loudly rather than run
  // wrong: a hybrid case observed under sync would report "absent" about a
  // seam that does not exist there.
  const mode = labComputedUpdateMode();
  const allSelected = caseIds.map(getBugCase);
  const bugCases = allSelected.filter(
    (bugCase) => (bugCase.computedUpdateMode ?? "sync") === mode,
  );
  const excluded = allSelected.filter(
    (bugCase) => (bugCase.computedUpdateMode ?? "sync") !== mode,
  );
  if (excluded.length > 0) {
    logPhase("mode-excluded", {
      mode,
      cases: excluded.map((bugCase) => bugCase.id).join(","),
    });
  }
  if (bugCases.length === 0) {
    throw new Error(
      `No selected case runs under computed-update mode "${mode}". ` +
        "The workflow gates each invocation on its own case list; locally, " +
        "match E2E_LAB_COMPUTED_UPDATE_MODE to the cases in the filter.",
    );
  }

  logPhase("module-loaded", {
    cases: bugCases.map((bugCase) => bugCase.id).join(","),
    computedUpdateMode: mode,
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
    await closeBrowserRuntime();
    await app?.close();
    logPhase("app-closed", {
      closeMs: Math.round(performance.now() - closeStarted),
    });
  });

  for (const bugCase of bugCases) {
    const title = `observes ${bugCase.id} [${bugCase.bug.issue}]`;
    const options = { timeout: bugCase.timeoutMs };
    const execute = async () => {
      logPhase("case:start", { caseId: bugCase.id });
      const caseStarted = performance.now();
      await runBugCase(bugCase, { app, appUrl, cookie });
      logPhase("case:done", {
        caseId: bugCase.id,
        caseMs: Math.round(performance.now() - caseStarted),
      });
    };
    if (serialRunners.has(bugCase.runner)) {
      it(title, options, execute);
    } else {
      it.concurrent(title, options, execute);
    }
  }
});
