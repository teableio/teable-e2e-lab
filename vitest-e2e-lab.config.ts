import swc from "unplugin-swc";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";
import { overridePathResolvePlugin } from "./vitest-override-plugin";

process.env.TZ = "UTC";
// One serial spec against the job-managed database — no per-worker DB clones.
process.env.E2E_WORKER_DB = "0";
// teable-ee runs two record engines behind one API, and this harness would
// otherwise route to v1 — the engine production has already left. Every recent
// bug report the lab collects arrives stamped `teable.version: v2`, and bases
// created through the API are v2 from birth, so v1 is the engine no reported
// bug lives on any more. Defaulting the lab to v2 is what makes a case ask
// about the code its bug came from; a v1-routed run answers a question nobody
// asked and reports it as a pass.
//
// Assignment is conditional so a run can still pin the other engine
// (FORCE_V2_ALL=false) to compare the two.
process.env.FORCE_V2_ALL ??= "true";

// This file is copied to teable-ee/enterprise/backend-ee/, so the relative
// imports above and the setup files below resolve inside teable-ee, exactly
// like the general e2e config they mirror.
const timeout = process.env.CI ? 60_000 : 10_000;
const e2eLabSpec =
  "../../community/apps/nestjs-backend/test/e2e-lab/e2e-lab.e2e-spec.ts";

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
    sequence: {
      hooks: "stack",
    },
    logHeapUsage: true,
    reporters: ["verbose"],
    include: [e2eLabSpec],
    exclude: [...configDefaults.exclude, "**/.next/**"],
  },
});
