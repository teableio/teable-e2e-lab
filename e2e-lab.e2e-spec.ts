import type { INestApplication } from "@nestjs/common";
import { performance } from "node:perf_hooks";
import { initApp } from "../utils/init-app";
import { getBugCase, resolveBugCaseIds } from "./registry";
import { applyEngineRuntimeEnv, type LabEngine } from "./framework/engine";
import { runBugCase } from "./framework/run-bug-case";

// The single executable entry point, in the perf-lab mold: this file is copied
// into teable-ee/community/apps/nestjs-backend/test/e2e-lab/ and run through
// teable-ee's own vitest e2e setup, so auth bootstrap, seed user, and Nest app
// startup stay aligned with the harness the product already maintains.
//
// One app PER ENGINE, every selected case in registry order under each. v2 is
// the engine this lab guards — fixes land there and a returning bug is a
// regression. v1 is a reference column: it is run to answer "what does the
// engine our older customers are still on do with this?", it is recorded, and
// it never fails a run. See framework/verdict.ts.
//
// Two things a reader will look for and should find here rather than guess:
// reaching v1 takes more than an environment switch (framework/case-base.ts
// unstamps each case's base), and a case whose feature does not exist on v1
// declares `skipV1` rather than being discovered as a failure every run.
//
// Cases overlap, a few at a time. They used to run strictly one after another
// because they shared a base and could not be trusted not to disturb each
// other; framework/case-base.ts removed the sharing, and most of what a case
// spends its time on is waiting rather than working — six of 106 cases held
// 68% of the wall clock, nearly all of it watching for something that must not
// happen. The width lives in vitest-e2e-lab.config.ts.

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

// Which engines this run asks for. Both by default: v1 costs one extra app
// boot and one extra pass, and a reference column nobody runs is not a
// reference. A single-engine list is how a local direction-finding run keeps
// its turnaround short.
const parseEngineList = (raw = "v1,v2"): LabEngine[] => {
  const engines = raw
    .split(",")
    .map((engine) => engine.trim())
    .filter(Boolean);
  const unsupported = engines.filter(
    (engine) => engine !== "v1" && engine !== "v2",
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Unsupported E2E_LAB_ENGINE_LIST: ${unsupported.join(", ")}. Available: v1, v2.`,
    );
  }
  if (engines.length === 0) {
    throw new Error("E2E_LAB_ENGINE_LIST must name at least one engine");
  }
  // v1 first, v2 last: the guarded engine is the one a reader should see at
  // the bottom of the log, next to the exit code only it can turn red.
  const unique = new Set(engines as LabEngine[]);
  return (["v1", "v2"] as LabEngine[]).filter((engine) => unique.has(engine));
};

describe("e2e-lab bug regression runner (e2e)", () => {
  const caseIds = resolveBugCaseIds(process.env.E2E_LAB_CASE_FILTER ?? "all");
  const bugCases = caseIds.map(getBugCase);
  const engines = parseEngineList(process.env.E2E_LAB_ENGINE_LIST);

  logPhase("module-loaded", {
    cases: caseIds.join(","),
    commitSha: process.env.E2E_LAB_COMMIT_SHA ?? "(local)",
    engines: engines.join(","),
  });

  for (const engine of engines) {
    describe(`engine ${engine}`, () => {
      let app: INestApplication;
      let appUrl: string;
      let cookie: string | undefined;

      beforeAll(async () => {
        // Set before the app boots and left set for the whole block: every
        // helper reads the engine live, so this assignment is what makes the
        // block mean what its name says.
        process.env.E2E_LAB_ENGINE = engine;
        applyEngineRuntimeEnv(engine);
        const initStarted = performance.now();
        const appCtx = await initApp();
        app = appCtx.app;
        appUrl = appCtx.appUrl;
        cookie = appCtx.cookie;
        logPhase("app-ready", {
          engine,
          initAppMs: Math.round(performance.now() - initStarted),
          appUrl,
        });
      });

      afterAll(async () => {
        const closeStarted = performance.now();
        await app?.close();
        logPhase("app-closed", {
          engine,
          closeMs: Math.round(performance.now() - closeStarted),
        });
      });

      for (const bugCase of bugCases) {
        const skipReason = engine === "v1" ? bugCase.skipV1 : undefined;
        const title = `observes ${bugCase.id} [${bugCase.bug.issue}] (${engine})`;

        if (skipReason) {
          // Skipped out loud. A case that silently vanished from one engine
          // would leave a gap the report cannot tell from a lost payload, and
          // the reason is the part a reader needs six months from now.
          it.skip(`${title} — skipped on v1: ${skipReason}`, () => {});
          continue;
        }

        it.concurrent(title, { timeout: bugCase.timeoutMs }, async () => {
          logPhase("case:start", { caseId: bugCase.id, engine });
          const caseStarted = performance.now();
          await runBugCase(bugCase, { app, appUrl, cookie });
          logPhase("case:done", {
            caseId: bugCase.id,
            engine,
            caseMs: Math.round(performance.now() - caseStarted),
          });
        });
      }
    });
  }
});
