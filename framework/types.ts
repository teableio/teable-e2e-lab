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
  "view-filter-roundtrip": ViewFilterRoundtripCaseConfig;
  "lookup-filter-view": LookupFilterViewCaseConfig;
  "lookup-user-snapshot-sort": LookupUserSnapshotSortCaseConfig;
  "computed-value-lands": ComputedValueLandsCaseConfig;
  "required-link-refresh": RequiredLinkRefreshCaseConfig;
  "link-delete-readable": LinkDeleteReadableCaseConfig;
  "table-trash-inbound-link": TableTrashInboundLinkCaseConfig;
  "required-link-blocks-delete": RequiredLinkBlocksDeleteCaseConfig;
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
  // The engine every case here guards. A constant, stamped into artifacts as
  // provenance - see framework/engine.ts.
  engine: string;
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

// Save a view filter that holds one finished condition and one the user has
// not finished yet -> checkpoint: the filter reads back verbatim AND the
// unfinished condition filters nothing. Two assertions because the fix has two
// halves that pull against each other: keep the condition for the panel,
// ignore it for the query.
export interface ViewFilterRoundtripCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Choices on the multiple-select field the unfinished condition points at.
  // Their names never appear in an assertion - the condition carries no value,
  // which is the entire point of it.
  choices: string[];
  // Rows seeded before the filter is saved. More than one, so "the finished
  // condition still selects" and "the unfinished one hid everything" cannot
  // look the same.
  rowTitles: string[];
  // The one title the finished condition matches. Must be in rowTitles.
  matchedTitle: string;
}

// Reference table with a single-select -> host table linking to it -> scalar
// lookup of that select -> a view that filters, sorts and groups on the lookup
// -> checkpoint: the view loads and returns exactly the rows it describes.
export interface LookupFilterViewCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The category the saved view keeps.
  allowedCategory: string;
  // The categories the saved view excludes with isNoneOf. More than one: a
  // single-element list can be compiled to an equality test and would skip the
  // array path the failure lives on.
  excludedCategories: string[];
  // Host rows. `category: null` links to nothing, which is what the isNotEmpty
  // half of the filter removes.
  rows: { task: string; category: string | null }[];
  // The tasks the saved view must return, in the order the view sorts them.
  expectedTasks: string[];
}

// One collaborator, two stored snapshots of them, one group -> checkpoint: a
// date sort inside that group runs straight down instead of restarting at the
// snapshot boundary. The snapshots are written straight to the database
// because nothing in the API produces them on demand - see
// framework/fixture-db.ts for when that is allowed.
export interface LookupUserSnapshotSortCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Display time zone of the sorted date field. Not load-bearing for this bug;
  // it is pinned so the dates in the fixture read the same everywhere.
  timeZone: string;
  // At least two groups, each a distinct stored snapshot of the SAME
  // collaborator. `snapshotExtras` are the keys that drift over a base's life
  // - email, avatarUrl - never id or title, which are the identity the group
  // header folds on.
  snapshotGroups: {
    key: string;
    snapshotExtras: Record<string, string>;
    // Dates must interleave ACROSS groups, or a sort that restarts at every
    // snapshot would produce the same order as a correct one and the case
    // would prove nothing. The runner refuses a fixture that fails this.
    rows: { name: string; date: string }[];
  }[];
}

// Link a host row to a source row, look the source value up, run a scalar
// formula over the lookup -> touch the source -> checkpoint: the formula's
// result arrives. The failure is a computed UPDATE Postgres rejects, which the
// pipeline dead-letters silently: the write answers 200 and the cell simply
// never changes. So the whole case, observation included, is public API, and
// the timeout is the assertion.
export interface ComputedValueLandsCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Stored as text on the source row and read through a json-array lookup.
  // The SHAPE of these strings is the fixture: a value that only survives the
  // round trip if the computed SQL reads it out of the array before casting.
  sourceValue: string;
  // What the source row is changed to, to force a recompute. It must DIFFER
  // from sourceValue: writing the same value back is a no-op, no computed task
  // is queued, and the case would sit there reading the successful first
  // backfill and calling it a pass. That is not hypothetical - it is what the
  // first version of this case did, on both sides of the fix.
  sourceValueAfter: string;
  // How long the formula result may take to arrive. This is the assertion, so
  // it has to sit above a slow-but-working pipeline and below "never".
  settleTimeoutMs: number;
  settlePollIntervalMs: number;
}

// A host row with a required manyOne link and a manyMany link to the same
// table, its foreign key cleared behind the product's back -> rename a row the
// manyMany link points at -> checkpoint: the new title reaches that cell, and
// the required link is still there. Both links refresh in one statement, so a
// NULL forced into the required link's NOT NULL display column takes the
// innocent field down with it.
export interface RequiredLinkRefreshCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Title of the row the required link points at.
  linkedTitle: string;
  // Title of the second row, before and after the rename that triggers the
  // refresh. They must differ, or the refresh would be invisible.
  otherTitle: string;
  otherTitleAfter: string;
  // How long the refreshed title may take to arrive. This is the assertion:
  // above a slow-but-working pipeline, below "never".
  settleTimeoutMs: number;
  settlePollIntervalMs: number;
}

// Two tables joined by a two-way oneOne link -> delete one side of it ->
// checkpoint: both tables still answer a record read. The side that does not
// host the physical foreign key had resolved its key name to `__id`, so its
// delete rule dropped the record id column of the table that does - and every
// read of that table selects `__id`.
export interface LinkDeleteReadableCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which side of the two-way link is deleted. "symmetric" - the side the
  // link was NOT created from, and which owns no physical column - is the one
  // that reproduces; "hosting" is the side that legitimately owns the foreign
  // key and is here so the choice is stated rather than implied.
  deletedSide: "symmetric" | "hosting";
  // Row titles are only there so a read that returns the wrong table is
  // visible in the artifact; nothing asserts on their content.
  hostRowTitle: string;
  foreignRowTitle: string;
}

// A surviving table linking into a target table -> move the target table to
// the trash -> checkpoint: the inbound link field degrades to text within the
// settle budget. The timeout is the assertion: before the fix the field stayed
// a Link pointing at an unreadable table until someone emptied the trash.
export interface TableTrashInboundLinkCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The linked row's title. Asserted before the delete, as fixture
  // verification - a link that never resolved would make "the field never
  // degraded" unreadable. Not asserted after: v2 loses the cell value in the
  // degrade (T6703, open), which is a different bug.
  targetRowTitle: string;
  hostRowTitle: string;
  // How long the degrade may take. Above a slow-but-working delete, below
  // "never" - which is exactly what the pre-fix behavior was.
  settleTimeoutMs: number;
  settlePollIntervalMs: number;
}

// A host row whose required manyOne link points at an owner row -> delete that
// owner row -> checkpoint: the delete is refused with a 4xx and both rows are
// intact. The delete used to succeed, and the computed writeback that followed
// dead-lettered on the NOT NULL display column, leaving a required link with
// nothing on the other end.
export interface RequiredLinkBlocksDeleteCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Titles for the two rows. Neither is asserted on - what matters is that the
  // link resolves before the delete and still resolves after the refusal - so
  // they are here to keep an artifact readable.
  ownerTitle: string;
  hostTitle: string;
}
