import type { INestApplication } from "@nestjs/common";
import type { IFieldRo } from "@teable/core";
import type { DayBucket } from "./runners/group-buckets";

// Single source of truth for the runner <-> config binding, mirroring
// teable-perf-lab: BugRunnerKind is the keys of this map, and BugCase (below)
// is discriminated on `runner`, so a case that pairs a runner with the wrong
// config shape fails `pnpm check:types` at the case file itself.
export interface BugCaseConfigByRunner {
  "http-check": HttpCheckCaseConfig;
  "record-flow": RecordFlowCaseConfig;
  "group-collapse": GroupCollapseCaseConfig;
  "share-save": ShareSaveCaseConfig;
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

// Seed a date field grouped into consecutive local-day buckets -> collapse each
// group in turn -> checkpoint: the rows the grid receives are exactly the rows
// outside the collapsed group. The date field's display time zone is the whole
// point of the config: a collapsed date group is excluded by a filter derived
// from the group key, and that derivation is where a time-zone mistake sends
// the exclusion at a neighbouring day. See framework/runners/group-buckets.ts
// for the two properties the bucket list must hold.
export interface GroupCollapseCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Display time zone of the grouped date field. The lab runs its server
  // process at UTC, so a zone east of UTC is what makes the mis-aimed
  // exclusion cross a day boundary and become observable at all.
  timeZone: string;
  // Consecutive local days, oldest first.
  buckets: DayBucket[];
}

// Share one folder out of a throwaway base -> save that share into a second
// base repeatedly -> checkpoint: every save answers 200 and every saved folder
// is visible in the target base, with names deduplicated. Both halves of the
// failure live in that one checkpoint: the second save answering 500 (the
// unique index on (base_id, name)) and a save that answers 200 but leaves the
// target base looking untouched (a node-list cache nobody flushed).
export interface ShareSaveCaseConfig {
  spaceId: "seed-space";
  // Prefix for the two throwaway bases this case builds; the runId is appended.
  baseNamePrefix: string;
  // Name of the single shared folder. Every save after the first must land
  // under a deduplicated variant of it.
  folderName: string;
  // How many times the same share is saved into the same target base. Must be
  // at least 2 - one save can never express "saving it again broke".
  saveCount: number;
  // The copy answers before the target base's node list is flushed, so the
  // list is polled. Exhausting this budget is how "saved but never visible"
  // reproduces.
  settleTimeoutMs: number;
  settlePollIntervalMs: number;
}
