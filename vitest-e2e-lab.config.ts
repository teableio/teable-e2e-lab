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
// had to run one at a time. The number is small on purpose: most of what
// overlapping buys back is idle waiting — a case watching for a notification
// that must not arrive — and stacking more than a handful of real workloads on
// one app process trades wall clock for measurement noise the timing-sensitive
// cases would pay for. Override with E2E_LAB_CONCURRENCY to bisect a case that
// only misbehaves alongside others; 1 restores the old serial order.
const concurrency = Number(process.env.E2E_LAB_CONCURRENCY ?? 4);

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
    logHeapUsage: true,
    reporters: ["verbose"],
    include: [e2eLabSpec],
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
});
