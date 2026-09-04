import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";
import { overridePathResolvePlugin } from "./vitest-override-plugin";

process.env.TZ = "UTC";
// One serial spec against the job-managed database — no per-worker DB clones.
process.env.E2E_WORKER_DB = "0";
// The record engine is pinned in framework/engine.ts and applied by the spec —
// this file is copied into teable-ee/enterprise/backend-ee/, where "./framework"
// does not resolve.

// This file is copied to teable-ee/enterprise/backend-ee/, so the relative
// imports above and the setup files below resolve inside teable-ee, exactly
// like the general e2e config they mirror.
const timeout = process.env.CI ? 60_000 : 10_000;
const e2eLabSpec =
  "../../community/apps/nestjs-backend/test/e2e-lab/e2e-lab.e2e-spec.ts";

// How many cases may be in flight at once. Cases became overlappable when each
// got its own base (framework/case-base.ts); before that they shared one and
// had to run one at a time.
//
// Two, not four. Most of what overlapping buys back is idle waiting — a case
// watching for a notification that must not arrive — so the width does not
// have to be large to collect it. Four was: it ran the suite in 81s against
// 150s serial, and then timed out base-share/y230-import-keeps-field-descriptions
// twice, a case that finishes in under a second on its own. Those cases move
// a whole base through export and import, and four of them against one app
// process is more than the machine has to give.
//
// Override with E2E_LAB_CONCURRENCY to bisect a case that only misbehaves
// alongside others; 1 restores the old serial order.
const concurrency = Number(process.env.E2E_LAB_CONCURRENCY ?? 2);

export default defineConfig({
  resolve: {
    conditions: ["@teable/source"],
  },
  ssr: {
    resolve: {
      conditions: ["@teable/source"],
      externalConditions: ["@teable/source"],
    },
  },
  plugins: [
    swc.vite({
      jsc: {
        target: "es2022",
      },
    }),
    overridePathResolvePlugin,
    tsconfigPaths(),
  ],
  cacheDir: "../../.cache/vitest/backend-ee/e2e-lab",
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest-e2e.setup.ts", "./vitest-e2e-init-app.setup.ts"],
    testTimeout: timeout,
    hookTimeout: Math.max(timeout, 120_000),
    passWithNoTests: false,
    pool: "forks",
    fileParallelism: false,
    maxConcurrency: concurrency,
    sequence: {
      hooks: "stack",
    },
    // A background worker finishing after its fixture is gone must not decide
    // this run.
    //
    // Import cases hand work to a queue; the case then asserts, and its
    // teardown removes the space the queue is still writing to. When the
    // worker's completion handler lands it updates a table that no longer
    // exists and rejects with nobody to catch it, and vitest fails the whole
    // file on that. Measured on run 33055688034: 247 tests passed, 11 skipped,
    // none failed, every payload written and the report job's acceptance gate
    // green — and the job was red anyway, on one such late import rejection.
    //
    // Ignoring them costs no signal. A case's evidence only ever arrives
    // through bugCheckpoint() and is written to its payload before anything is
    // allowed to throw; the payloads, judged by the report job, are what says
    // whether a run passed. Vitest still PRINTS these under "Unhandled
    // Errors" while the complete payload set remains the acceptance source of
    // truth.
    dangerouslyIgnoreUnhandledErrors: true,
    logHeapUsage: true,
    reporters: ["verbose"],
    include: [e2eLabSpec],
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
});
