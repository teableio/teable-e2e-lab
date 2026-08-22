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
  "legacy-unique-error": LegacyUniqueErrorCaseConfig;
  "paste-non-collaborator-user": PasteNonCollaboratorUserCaseConfig;
  "stale-lookup-recast": StaleLookupRecastCaseConfig;
  "null-multiplicity-lookup": NullMultiplicityLookupCaseConfig;
  "excel-import-duplicate-columns": ExcelImportDuplicateColumnsCaseConfig;
  "audit-user-name-resolves": AuditUserNameResolvesCaseConfig;
  "view-filter-realtime": ViewFilterRealtimeCaseConfig;
  "view-property-realtime": ViewPropertyRealtimeCaseConfig;
  "delete-undo-restores": DeleteUndoRestoresCaseConfig;
  "cross-base-link-delete": CrossBaseLinkDeleteCaseConfig;
  "excel-import-offset-header": ExcelImportOffsetHeaderCaseConfig;
  "paste-by-id-alignment": PasteByIdAlignmentCaseConfig;
  "search-view-filter": SearchViewFilterCaseConfig;
  "user-field-notify-bulk-action": UserFieldNotifyBulkActionCaseConfig;
  "user-field-notify-replay": UserFieldNotifyReplayCaseConfig;
  "user-field-notify-burst": UserFieldNotifyBurstCaseConfig;
  "user-group-identity": UserGroupIdentityCaseConfig;
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
  // The teable-ee commits this case settles: the fix it reproduces, or - for a
  // sentinel, which has no fix behind it - the rewrites it was written to
  // guard. Short SHAs.
  //
  // This exists for the next triage pass rather than for this run. Scanning
  // recent commits for uncovered fixes is how a batch of cases starts, and
  // without this the scan can only match on issue ids: a sentinel matches
  // nothing, a commit carrying three issue ids looks two-thirds uncovered, and
  // every commit already examined comes back up as a fresh candidate. Listing
  // the commits a case answers for lets that pass skip them and spend its time
  // on what is actually left.
  //
  // Commits examined and deliberately NOT turned into a case belong in
  // docs/triage-ledger.md, which is the other half of the same answer.
  sourceCommits?: string[];
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
  // Which side of the link the host holds. Stated rather than defaulted
  // because the two cases on this runner deliberately differ: a manyOne link
  // stores one JSON object per row, a oneMany link stores an array, and the
  // reported reproduction of the missing-column variant is the oneMany one.
  relationship: "manyOne" | "oneMany";
  // Drop the link field's physical column before trashing the target, leaving
  // metadata that describes a column the table does not have. This is the
  // T6880 variant: the conversion renamed that column unconditionally, so a
  // table whose display column was never provisioned failed the schema update
  // outright and left the host with a Link field and a dead operation.
  //
  // It is a fixture written through framework/fixture-db.ts, which is why it
  // is a flag rather than a second runner - everything either case observes,
  // and every assertion, is identical.
  dropLinkDisplayColumn: boolean;
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

// A table carrying a unique index named the way v1 named them -> insert a
// duplicate value -> checkpoint: the 400 says which field. v2 read the field
// out of the constraint name and understood only its own naming form, so on a
// migrated table the message rendered with an empty field name and no i18n
// payload - unrecognisable to an integration branching on the conflict.
export interface LegacyUniqueErrorCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Written once during setup and then written again to collide with itself.
  // Its content carries nothing; the collision is the fixture.
  duplicateValue: string;
}

// A user field, and a member who exists on the platform but is not a
// collaborator of this base -> paste that member in the way the grid does when
// a user cell is copied -> checkpoint: the paste lands. The write path had been
// narrowed to collaborators while the read path stayed open, so the column
// displayed a person it refused to let anyone write.
export interface PasteNonCollaboratorUserCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Display name of the outsider. Their id and email are derived from the
  // runId instead: the row is real platform state, so it must not collide
  // with a leftover from an earlier run.
  outsiderName: string;
  // Primary-field value of the single row. Nothing asserts on it.
  rowTitle: string;
}

// Lookups whose stored metadata says TEXT while their physical column is
// `double precision` or `jsonb` -> rebuild them -> checkpoint: the values come
// back. The backfill generated its assignment from the metadata, Postgres
// refused it, and the table.update schema operation died where no caller could
// see it - leaving a lookup column that quietly stopped filling in.
export interface StaleLookupRecastCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which lookups the host carries, and therefore which physical column types
  // the drifted TEXT metadata has to be recast against: "number" is stored as
  // double precision, "link" as jsonb. Both mismatches were reported.
  lookups: ("number" | "link")[];
  // What makes the rebuild run. "add-filter" changes what the lookup selects;
  // "display-only" changes nothing but the number's formatting, which is the
  // weaker of the two and the one the second report came in on - the rebuild
  // still has to derive the physical type even when the values cannot have
  // moved. Either way it must be a real change: re-submitting identical
  // options queues no backfill, and the case would read the pre-drift values
  // back and call it a pass.
  trigger: "add-filter" | "display-only";
  // Value behind the number lookup. Non-integer on purpose - an integer would
  // survive a text round trip that a real double does not.
  sourceNumber: number;
  // Title behind the link lookup, matched as a substring of the cell.
  peerTitle: string;
  // How long a rebuilt lookup may take to fill in. This is the assertion: the
  // failure raises nothing at the caller, it just never arrives.
  settleTimeoutMs: number;
  settlePollIntervalMs: number;
}

// A scalar lookup whose `is_multiple_cell_value` is NULL rather than false ->
// recompute it, or convert it away -> checkpoint: whichever was asked for
// works. Unset multiplicity was read as multi-valued, so computed updates
// projected jsonb into a TEXT column and the conversion ran jsonb_typeof over
// plain text. The table could neither compute nor be repaired from inside the
// product.
export interface NullMultiplicityLookupCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which half of the failure this case watches. "recompute" is the outage;
  // "convert-to-text" is the way out the user reached for and did not have.
  observe: "recompute" | "convert-to-text";
  // The looked-up title, before and after the upstream edit that forces the
  // recompute. They must differ: writing the same title back queues no
  // computed task, and the case would read the pre-drift value and pass.
  sourceValue: string;
  sourceValueAfter: string;
  settleTimeoutMs: number;
  settlePollIntervalMs: number;
}

// An Excel sheet whose header row repeats a column name -> import it as a new
// table -> checkpoint: the table is created and every column got a distinct
// physical name. Excel imports were pushed back from v2 as an unsupported
// feature and ran v1's batch column add, which did not make physical names
// unique - so a repeated header answered Postgres 42701 and the import 500'd.
export interface ExcelImportDuplicateColumnsCaseConfig {
  // No `baseId`: this case builds its own space and base. The EE import
  // controller derives a row budget from the space's usage and answers 402
  // when it runs out, so importing into the shared seed base would eventually
  // fail for a reason unrelated to the bug.
  tableNamePrefix: string;
  // The header row. It must repeat a name - that repetition is the fixture,
  // and the runner refuses a row of distinct headers rather than passing on a
  // question it never asked.
  headers: string[];
  // One data row, so the import has something to write and the case covers
  // the data path rather than just the schema.
  row: string[];
  // Import time zone. Not load-bearing here; pinned so a date-shaped cell
  // could never make the result depend on where this runs.
  timeZone: string;
}

// Rows whose LastModifiedBy cell is stored the way older tables store it ->
// read them -> checkpoint: the cell carries the editor's name. v2's read
// hydration enriched public user cells but skipped `lastModifiedBy`, so cells
// without their own stored snapshot fell back to showing the raw user id where
// a person's name belongs.
export interface AuditUserNameResolvesCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Titles for the two rows, one per historical storage shape. They are only
  // labels - what is asserted is the audit cell beside them.
  legacyRowTitle: string;
  missingSnapshotRowTitle: string;
}

// A client subscribed to a view -> set and clear that view's filter ->
// checkpoint: the client applies every update and never errors. Updating the
// filter on a view that had none emitted an op carrying a path and no
// instruction, which ot-json0 refuses - so every subscribed client threw and
// the user got a Socket Error toast, while the HTTP request answered 200.
export interface ViewFilterRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The one row's title, reused as the filter's value so the filter is a
  // realistic one rather than a shape nothing matches.
  rowTitle: string;
  // How long the client may take to attach. Failing to subscribe is a fixture
  // failure, not a reproduction.
  subscribeTimeoutMs: number;
  // How long an update may take to reach the subscriber. This is half the
  // assertion - the other half is that no error arrived instead.
  settleTimeoutMs: number;
}

// A client subscribed to a view -> change its group, then its sort ->
// checkpoint: the subscriber sees both. The writes persisted, but nothing was
// pushed to the client that made them, so the grid kept its old layout until
// the page was reloaded.
export interface ViewPropertyRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Enough rows that a group and a sort are meaningful rather than degenerate;
  // nothing asserts on the titles themselves.
  rowTitles: string[];
  subscribeTimeoutMs: number;
  // How long a change may take to reach the subscriber. This is the assertion:
  // before the fix it never arrived at all.
  settleTimeoutMs: number;
}

// Delete every row -> undo -> checkpoint: every row is back, with its id, its
// position and every cell. A SENTINEL: no bug behind it, guarding a path that
// keeps being optimised and whose failure would be silent - undo answering
// "fulfilled" while bringing back less than it took.
export interface DeleteUndoRestoresCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // At least 2. One row cannot express a PARTIAL restore, which is the shape
  // this guards; the runner refuses anything smaller.
  recordCount: number;
}

// Two bases in one space, an OPTIONAL one-way link reaching from the second
// into the first -> delete the row it points at -> checkpoint: the delete
// succeeds and the cross-base link cell clears.
//
// A second owner row, linked only from within its own base, is deleted first
// as a control from OUTSIDE the checkpoint: if the same-base delete misbehaves
// too, the product is wrong about optional links in general, which is a
// different fault from "the cleanup stops at the base boundary".
export interface CrossBaseLinkDeleteCaseConfig {
  // This case owns its space: it needs two bases that can see each other, and
  // the shared seed base cannot supply the second one.
  baseId: "own-space";
  namePrefix: string;
  // The row reached only from inside its own base - the control.
  sameBaseOwnerTitle: string;
  // The row reached from the other base - the one under test.
  crossBaseOwnerTitle: string;
  sameBaseHostTitle: string;
  crossBaseHostTitle: string;
}

// Build an Excel sheet whose used range starts below A1 -> analyze and import
// it -> checkpoint: the analyzer reports the header row's columns, the table
// is created with those field names, and the data row lands under them.
export interface ExcelImportOffsetHeaderCaseConfig {
  // This case owns its space: the import row budget is derived from the
  // space's usage, so importing into a space other cases fill would
  // eventually answer 402 for reasons unrelated to this bug.
  baseId: "own-space";
  namePrefix: string;
  // Where the sheet's content starts, e.g. "A2". Anything below row 1 leaves
  // the hole at dense-row index 0 that this case is about; the runner re-reads
  // the workbook and refuses a fixture that landed at A1 anyway.
  origin: string;
  headers: string[];
  // One data row, the same width as the headers.
  row: (string | number)[];
  timeZone: string;
}

// Paste a column of distinct values into a list of records by id ->
// checkpoint: every value landed on its own record, and a paste naming a
// record that does not exist is refused rather than dropped from a positional
// payload.
export interface PasteByIdAlignmentCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // At least 3 - below that a shift by one row cannot be told from a single
  // wrong cell. The runner refuses anything smaller.
  rowCount: number;
}

// Seed rows that cross two independent axes - inside/outside the saved view
// filter, matched/not matched by the search term -> save the view filter ->
// checkpoint: searching by viewId counts and indexes only the rows the view
// actually shows.
export interface SearchViewFilterCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The needle. It is the name of one choice on the searched single-select
  // field, so a row either carries it in that cell or does not - no partial
  // matches to reason about.
  searchTerm: string;
  // The rows, one per name. The runner refuses a set that does not populate
  // all three quadrants it needs; see rowProblems() for which and why.
  rows: { name: string; inView: boolean; matches: boolean }[];
}

// A second person assigned in a user field -> move that assignment in bulk ->
// checkpoint: their notification list stays empty for the whole quiet budget.
// The budget is the assertion, and it is only trusted because the same run
// first measured how long a real notification takes on this commit.
export interface UserFieldNotifyBulkActionCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which bulk path moves the assignment. Both re-deliver a user cell that
  // was already populated; they differ only in how the runner produces it,
  // which is why they share a runner rather than duplicating the control
  // measurement and the quiet loop.
  action: "import" | "tableDuplicate";
  // The control row, created on a throwaway table with a plain record create.
  // Its notification is the proof that notifications work here at all.
  controlRowTitle: string;
  // The row the bulk action moves. Read back before the checkpoint: an
  // assignment that never landed could not have notified anyone.
  actionRowTitle: string;
  // How long the control notification may take before the case gives up and
  // calls the pipeline broken.
  notifyTimeoutMs: number;
  // How long silence has to hold. Refused at runtime if it is not at least
  // three times the control latency actually observed.
  quietTimeoutMs: number;
  // How long the moved row may take to become readable with the user in it.
  // Import lands asynchronously, so this is not the same clock as the others.
  rowVisibleTimeoutMs: number;
  pollIntervalMs: number;
}

// An assignment the person was already told about -> put it back through a
// path that only replays it -> checkpoint: they hear nothing the second time.
// Same control-then-quiet skeleton as UserFieldNotifyBulkActionCaseConfig, but
// the control is the first assignment on the table under test rather than a
// separate table, because the record has to be assigned before it can be
// replayed. The unread list is marked read in between, which is what makes
// "no unread notification" mean "nothing new".
export interface UserFieldNotifyReplayCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which replay puts the assignment back.
  //   undoDelete      - delete the row and undo, replaying the create
  //   undoClear       - clear the assignee and undo, replaying the update
  // The last two are the ones that needed a second guard: a replay re-issues
  // the original request, so its source still reads 'user' and only the
  // execution context says it is a replay.
  replay: "undoDelete" | "undoClear";
  rowTitle: string;
  // How long the first assignment's notification may take before the case
  // gives up and calls the pipeline broken.
  notifyTimeoutMs: number;
  // How long silence has to hold afterwards. Refused at runtime if it is not
  // at least three times the control latency actually observed.
  quietTimeoutMs: number;
  // How long the replay may take to be readable - the row to come back with
  // its assignment. Not the same clock as the quiet
  // budget, which only starts once the replay is visible.
  replaySettleTimeoutMs: number;
  pollIntervalMs: number;
}

// Assign the same person on N records in a row -> checkpoint: they get a
// handful of notifications, not N. The ceiling is asserted rather than an
// exact count: the fix delivers the first immediately and merges the rest,
// so the steady state is two, and where the burst lands inside the window is
// timing this case must not fail on.
export interface UserFieldNotifyBurstCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitlePrefix: string;
  // How many separate assignments to make. One request each, not one batch:
  // a batch is a single act of assignment and always produced a single
  // notification.
  burstSize: number;
  // The ceiling. The runner refuses a value that is not strictly between the
  // coalesced result (2) and burstSize, because outside that range the
  // assertion cannot separate the two behaviors.
  maxNotifications: number;
  // How long to wait after the burst before counting. Has to outlast the
  // coalescing window, or the count reads the first instant delivery as the
  // whole story and passes on a commit that coalesces nothing.
  settleAfterBurstMs: number;
// A user field holding the cell shapes a base accumulates - a fresh snapshot,
// a drifted one, a bare user id, an unwrapped object - grouped by that field
// -> checkpoint: the rows land in the buckets the fixture declares.
//
// Grouping folds on identity (id and title) rather than on the stored cell,
// because the stored cell is a write-time snapshot. Every shape identity
// cannot be read out of is a collaborator filed under "empty".
export interface UserGroupIdentityCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Whether the user field accepts several people. `bareObject` is only
  // meaningful when this is true - it is the leftover of a single -> multiple
  // conversion.
  multiple: boolean;
  rows: {
    name: string;
    // How this row's cell is physically stored. `assigned` and `drifted` are
    // written through the API first, so the ordinary shape in the fixture is
    // the one the product itself produces; `drifted` is then rewritten with
    // the later snapshot.
    stored: "assigned" | "drifted" | "scalarId" | "bareObject" | "empty";
    // Keys that drift over a base's life - email, avatarUrl. Never id or
    // title: those are the identity, and moving them would make the rows
    // genuinely different people.
    snapshotExtras?: Record<string, string>;
    // Which bucket this row belongs in. Rows sharing a label must come back
    // in one group.
    bucket: string;
  }[];
  // The partition the pre-fix grouping produces, as arrays of row names.
  // Declared rather than derived: what the broken code does with each shape
  // is the thing under test, and deriving it would make the case agree with
  // itself instead of with the product. The runner refuses a fixture whose
  // broken partition equals its expected one.
  brokenBuckets: string[][];
}
