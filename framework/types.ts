import type { INestApplication } from "@nestjs/common";
import type { IFieldRo } from "@teable/core";

// Single source of truth for the runner <-> config binding, mirroring
// teable-perf-lab: BugRunnerKind is the keys of this map, and BugCase (below)
// is discriminated on `runner`, so a case that pairs a runner with the wrong
// config shape fails `pnpm check:types` at the case file itself.
export interface BugCaseConfigByRunner {
  "http-check": HttpCheckCaseConfig;
  "record-flow": RecordFlowCaseConfig;
}

export type BugRunnerKind = keyof BugCaseConfigByRunner;

// The bug a case reproduces, and what we currently believe about it. `status`
// is the only human-maintained judgment input in the whole system:
//
//   - "fixed": the correct behavior is expected to hold. The case passing is a
//     pass; the case reproducing the bug is a REGRESSION and fails the run.
//   - "open": the bug is known and unfixed. Reproducing it is the expected
//     outcome and does not fail anything; the case suddenly passing is an
//     "unexpectedly fixed" notice asking a human to confirm and flip this
//     field — it never fails the run either.
//
// Sentinel cases (correct behavior asserted as a regression tripwire, not tied
// to a historical bug report) use `issue: "sentinel/<name>"` with status
// "fixed".
export interface BugRef {
  // Issue id in the tracker (e.g. "T1481"), or "sentinel/<name>".
  issue: string;
  status: "open" | "fixed";
  // Optional URL to the report/fix for humans reading the comparison table.
  link?: string;
  // Reserved: oldest teable-ee revision this case is meaningful on. Not
  // enforced yet — the planner and the comparison table will learn to render
  // "not applicable" cells from it before anyone registers a case that needs
  // it. Declaring it early costs nothing and dates the knowledge.
  appliesSince?: string;
}

interface BugCaseBase {
  id: string;
  title: string;
  bug: BugRef;
  timeoutMs: number;
}

// A runner-specific view of a bug case, keeping the runner literal and its
// config together instead of widening both back to the full union.
export type BugCaseFor<K extends BugRunnerKind> = {
  [P in K]: BugCaseBase & {
    runner: P;
    config: BugCaseConfigByRunner[P];
  };
}[K];

export type BugCase = BugCaseFor<BugRunnerKind>;

export interface BugRunContext {
  app: INestApplication;
  appUrl: string;
  cookie?: string;
  runId: string;
  // The teable-ee revision under test, stamped into every artifact so the
  // comparison table never has to infer a column from a directory name.
  commitSha: string;
  artifactDir?: string;
}

// What a runner returns when the bug did NOT reproduce. Diagnostic detail
// only — the verdict is derived by the wrapper, never by the runner.
export interface BugProbeResult {
  details?: Record<string, unknown>;
}

/**
 * Thrown when a case reached its checkpoint and observed the bug. This is the
 * seam that separates "the bug reproduced" from "the harness broke": anything
 * else thrown out of a runner is an error (💥), not a reproduction (❌/⬜).
 *
 * Runners do not construct this directly — they wrap the observation in
 * `bugCheckpoint()` (framework/checkpoint.ts), which converts whatever the
 * checkpoint throws into this type.
 *
 * Plain fields rather than parameter properties: Node's strip-only TypeScript
 * mode — how `pnpm check` runs the framework tests — refuses parameter
 * properties. (Lesson inherited from perf-lab's PerfRunDiagnosticError.)
 */
export class BugPresentError extends Error {
  readonly checkpoint: string;
  readonly evidence?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      cause?: unknown;
      checkpoint: string;
      evidence?: Record<string, unknown>;
    },
  ) {
    super(
      message,
      options.cause instanceof Error ? { cause: options.cause } : undefined,
    );
    this.name = "BugPresentError";
    this.checkpoint = options.checkpoint;
    this.evidence = options.evidence;
  }
}

export interface HttpCheckCaseConfig {
  method: "GET";
  path: string;
  // The correct behavior asserted at the checkpoint.
  expect: {
    status: number;
    seedUser?: boolean;
  };
}

export interface RecordFlowFieldSpec {
  name: string;
  type: Extract<
    IFieldRo["type"],
    "singleLineText" | "longText" | "number" | "checkbox"
  >;
}

// Create table -> seed revision-1 rows -> verify seed landed -> perform the
// mutation under test -> checkpoint: full scan proves revision 2 landed on
// every row and every cell, no row survived at revision 1, the row count and
// record-id order are unchanged. The revision-based value formula guarantees
// that for every row and every field, revision 1 != revision 2 — without that
// property, "this row was never updated" is invisible on any cell where the
// two revisions coincide. See framework/runners/record-values.ts and its test.
// Generic so the return type keeps the case's specific config variant, and the
// constraint enforces the runner<->config binding at the case file. (No
// `const` type parameter: `id`/`title` stay `string`, so the registry's
// case-id map stays open.)
export const defineBugCase = <T extends BugCase>(bugCase: T): T => bugCase;

export interface RecordFlowCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  fields: RecordFlowFieldSpec[];
  recordCount: number;
  // The measured write is split into batches on purpose: a single-call update
  // cannot express "only part of it landed".
  batchSize: number;
  mutation: {
    kind: "bulk-update-all-fields";
  };
  fullScanPageSize?: number;
}
