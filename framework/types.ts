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
  "paste-over-pending-field": PasteOverPendingFieldCaseConfig;
  "delete-collateral": DeleteCollateralCaseConfig;
  "duplicate-shared-view": DuplicateSharedViewCaseConfig;
  "legacy-record-id": LegacyRecordIdCaseConfig;
  "restore-conditional-lookup": RestoreConditionalLookupCaseConfig;
  "sparse-view-field-order": SparseViewFieldOrderCaseConfig;
  "conditional-filter-field-refs": ConditionalFilterFieldRefsCaseConfig;
  "value-normalization": ValueNormalizationCaseConfig;
  "link-cell-shape": LinkCellShapeCaseConfig;
  "rating-conversion": RatingConversionCaseConfig;
  "manual-sort-realtime": ManualSortRealtimeCaseConfig;
  "repeated-foreign-links": RepeatedForeignLinksCaseConfig;
  "legacy-field-id": LegacyFieldIdCaseConfig;
  "nested-lookup-rename": NestedLookupRenameCaseConfig;
  "table-restore-scope": TableRestoreScopeCaseConfig;
  "rollup-filter-persists": RollupFilterPersistsCaseConfig;
  "lookup-retarget": LookupRetargetCaseConfig;
  "required-default": RequiredDefaultCaseConfig;
  "legacy-date-filter": LegacyDateFilterCaseConfig;
  "formula-over-date-lookup": FormulaOverDateLookupCaseConfig;
  "aggregation-mixed-case": AggregationMixedCaseCaseConfig;
  "checkbox-cleared-default": CheckboxClearedDefaultCaseConfig;
  "csv-headers-disabled": CsvHeadersDisabledCaseConfig;
  "link-rename-keeps-config": LinkRenameKeepsConfigCaseConfig;
  "unique-toggle-cleanup": UniqueToggleCleanupCaseConfig;
  "multi-field-update-realtime": MultiFieldUpdateRealtimeCaseConfig;
  "base-import-field-description": BaseImportFieldDescriptionCaseConfig;
  "user-write-scope": UserWriteScopeCaseConfig;
  "orphan-link-field-delete": OrphanLinkFieldDeleteCaseConfig;
  "text-to-date-conversion": TextToDateConversionCaseConfig;
  "button-display-change": ButtonDisplayChangeCaseConfig;
  "link-picker-primary-field": LinkPickerPrimaryFieldCaseConfig;
  "rollup-metadata-rename": RollupMetadataRenameCaseConfig;
  "cleared-default": ClearedDefaultCaseConfig;
  "legacy-generated-audit-column": LegacyGeneratedAuditColumnCaseConfig;
  "delete-error-state-table": DeleteErrorStateTableCaseConfig;
  "link-paste-formula-title": LinkPasteFormulaTitleCaseConfig;
  "generated-formula-column": GeneratedFormulaColumnCaseConfig;
  "incoming-link-cleanup": IncomingLinkCleanupCaseConfig;
  "formula-error-repair": FormulaErrorRepairCaseConfig;
  "select-option-removal-realtime": SelectOptionRemovalRealtimeCaseConfig;
  "append-import-computed": AppendImportComputedCaseConfig;
  "tied-sort-offset": TiedSortOffsetCaseConfig;
  "form-required-computed": FormRequiredComputedCaseConfig;
  "lookup-config-realtime": LookupConfigRealtimeCaseConfig;
  "user-multiplicity-formula": UserMultiplicityFormulaCaseConfig;
  "grouped-range-offset": GroupedRangeOffsetCaseConfig;
  "table-usable-after-failed-update": TableUsableAfterFailedUpdateCaseConfig;
  "restore-inbound-link": RestoreInboundLinkCaseConfig;
  "oversized-select-choice": OversizedSelectChoiceCaseConfig;
  "timezone-alias": TimezoneAliasCaseConfig;
  "duplicate-field-realtime": DuplicateFieldRealtimeCaseConfig;
  "user-field-notify-on-assign": UserFieldNotifyOnAssignCaseConfig;
  "me-filter-in-view": MeFilterInViewCaseConfig;
  "duplicate-select-choice": DuplicateSelectChoiceCaseConfig;
  "datetime-diff-default-unit": DatetimeDiffDefaultUnitCaseConfig;
  "is-within-today-filter": IsWithinTodayFilterCaseConfig;
  "sparse-batch-update": SparseBatchUpdateCaseConfig;
  "lookup-of-rollup-create": LookupOfRollupCreateCaseConfig;
  "ai-config-only-change-plan": AiConfigOnlyChangePlanCaseConfig;
  "empty-write-normalization": EmptyWriteNormalizationCaseConfig;
  "table-delete-realtime": TableDeleteRealtimeCaseConfig;
  "archive-recount": ArchiveRecountCaseConfig;
  "projected-group-headers": ProjectedGroupHeadersCaseConfig;
  "lookup-multiplicity-vo": LookupMultiplicityVoCaseConfig;
  "link-picker-share-lookup": LinkPickerShareLookupCaseConfig;
  "manyone-typecast-shape": ManyoneTypecastShapeCaseConfig;
  "row-count-search-projection": RowCountSearchProjectionCaseConfig;
  "share-copy-outside-panel": ShareCopyOutsidePanelCaseConfig;
  "lookup-select-choices-kept": LookupSelectChoicesKeptCaseConfig;
  "boolean-formula-filter": BooleanFormulaFilterCaseConfig;
  "duplicate-base-recent-list": DuplicateBaseRecentListCaseConfig;
  "longtext-markdown-convert": LongtextMarkdownConvertCaseConfig;
  "stale-view-column-meta": StaleViewColumnMetaCaseConfig;
  "nested-filter-conjunction": NestedFilterConjunctionCaseConfig;
  "conditional-rollup-user-match": ConditionalRollupUserMatchCaseConfig;
  "formula-over-system-columns": FormulaOverSystemColumnsCaseConfig;
  "tracked-modified-sort": TrackedModifiedSortCaseConfig;
  "lookup-of-link-contains": LookupOfLinkContainsCaseConfig;
  "delete-without-undo-capture": DeleteWithoutUndoCaptureCaseConfig;
  "single-field-pending-state": SingleFieldPendingStateCaseConfig;
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
  // "oneField" names the searched column; "everyField" sends the term on its
  // own, the way the grid's search box does, and adds a date column so the
  // search covers one - which is the shape where the view's filter was
  // dropped.
  scope: "oneField" | "everyField";
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
  action: "import" | "tableDuplicate" | "recordDuplicate";
  // Only the one-row copy reads this: how long to wait after the assignment
  // before copying, so the copy's notification cannot be folded into the
  // assignment's. Ignored by the other actions.
  coalescingWindowMs?: number;
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
}

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
  // What the pre-fix grouping does with this fixture. Declared rather than
  // derived - what the broken code does with each cell shape is the thing
  // under test, and deriving it would make the case agree with itself instead
  // of with the product - and copied from the run that first went red rather
  // than guessed.
  //
  // "partition" is the ordinary form: the same rows, in different buckets. The
  // runner refuses a broken partition equal to the expected one, or one that
  // does not cover exactly the fixture rows.
  //
  // "headerlessRowSegments" is what one bucket splitting apart looks like from
  // outside: a single header, then row segments belonging to no header at all,
  // which the grid draws as extra rows with the numbering restarted. It is not
  // a partition, so there is nothing to compare - the segments are the
  // finding.
  broken:
    | { kind: "partition"; buckets: string[][] }
    | { kind: "headerlessRowSegments" };
}

// A field left marked pending with no physical column behind it - what a
// schema operation that died partway leaves - and a paste whose selection
// spans it. The write asked for every field in the selection, reached for a
// column that is not there, and took the ordinary columns down with it.
export interface PasteOverPendingFieldCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which paste request the product sends. "range" is the grid's own,
  // addressed by column position; "byId" addresses fields by id. Different
  // request handling, same selection.
  paste: "range" | "byId";
  // Written to the two ordinary columns around the pending one. They have to
  // differ from each other - see the runner.
  firstValue: string;
  lastValue: string;
}

// Two ways a delete took more than it was asked for, on one runner because the
// shape is the same: delete something, then look at what was standing next to
// it.
export interface DeleteCollateralCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // "sharedColumn": two live fields mapped to one physical column, and the
  // delete of one drops the column both name. The collision is written with
  // SQL - it is the outcome of a race, and re-enacting the race would test
  // timing rather than the delete.
  // "repeatedDelete": deleting records that are already gone.
  variant: "sharedColumn" | "repeatedDelete";
  rowCount: number;
  // Prefix of the values the surviving field holds. Read back before and after
  // the delete, so the assertion is about data rather than about a status.
  keptValuePrefix: string;
}

// A table with a shared view, duplicated. Sharing mints a credential that is
// unique across the instance - it is the address of a public page - and the
// copy carried the source's, so the insert met the unique index and the whole
// duplicate failed.
export interface DuplicateSharedViewCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
}

// A row whose id body is not the 16 characters this version generates - what
// an imported or migrated base carries, because v1 only enforced the prefix.
// v2 parsed ids strictly and the row's computed update failed deterministically
// and dead-lettered.
export interface LegacyRecordIdCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The id the migrated row is given. Must keep the `rec` prefix - v1 did
  // enforce that - and must not have a 16-character body, which is exactly
  // what this version generates. The runner refuses both.
  legacyRecordId: string;
  // Rows with ordinary ids, sharing the write. They are what shows whether the
  // one unparseable row took the batch with it.
  ordinaryRowCount: number;
  // The value every row holds first, and what they are all changed to. They
  // must differ, or the write queues no recompute.
  seedValue: string;
  updatedValue: string;
  settleTimeoutMs: number;
  settlePollIntervalMs: number;
}

// A lookup that matches rows by a value rather than through a link, deleted
// and then restored from the trash. The condition is the whole field: without
// it there is nothing saying which row to read.
export interface RestoreConditionalLookupCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // One row per pair. `ref` is the shared reference the condition matches on -
  // they have to be distinct, or a condition matching the wrong row would pass
  // - and `value` is what the host row should end up showing.
  rows: { ref: string; value: string }[];
  // The trash entry is written asynchronously; this is how long it may take to
  // appear before the case calls the fixture broken.
  trashVisibleTimeoutMs: number;
  pollIntervalMs: number;
}

// A view whose column metadata mentions only some of its fields - what a table
// older than that bookkeeping looks like - and a field added to it. The new
// column's position was derived from the entries that exist rather than from
// the columns that exist, so it was given a position already taken.
export interface SparseViewFieldOrderCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The fields whose view entry is removed. At least two: with one, an
  // appended column landing on top of it cannot be told from an ordering that
  // is merely off by one.
  legacyFieldNames: string[];
  addedFieldName: string;
}

// A conditional lookup whose condition compares two columns of one table
// against each other. Which table those columns belong to picks the failure:
// naming the source table on both sides probed the referenced column on the
// wrong alias, naming the host table on both sides resolved the filter field
// against the source table and did not find it. Both dead-lettered the table's
// whole computed run as a code bug, on every recompute.
export interface ConditionalFilterFieldRefsCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which table the condition's two sides name. "sourceBothSides" is kept
  // because the runner still supports it and a future attempt at T6615 starts
  // there; no case uses it today - see docs/triage-ledger.md.
  source: "sourceBothSides" | "hostBothSides";
  // The table being read from. For "sourceBothSides" exactly one row's keys
  // agree, and its value is what every host row must end up showing; for
  // "hostBothSides" there is exactly one row, because that condition selects
  // every source row and more than one would raise a different question - how
  // several matches are joined.
  foreignRows: { name: string; left: string; right: string; value: string }[];
  // The table the lookup lives on. Its own two key columns are what
  // "hostBothSides" compares.
  hostRows: { name: string; left: string; right: string }[];
  // What the selected source row's value is changed to, to force a recompute
  // after the backfill.
  editedValue: string;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A value a field cannot hold as written, sent through the typecast path an
// import or a paste uses. What the field decides to store is what filters,
// formulas and every later read see, and v2's answers had drifted from v1's.
export interface ValueNormalizationCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // "invalidDate": a date that does not exist. "ratingFraction": a fractional
  // rating in a field whose domain is whole stars. "emptyValue": clearing a
  // cell that held something.
  variant: "invalidDate" | "ratingFraction" | "emptyValue";
  // What the cell holds before the write. Only used by "emptyValue", which
  // needs a cell that was filled before it is cleared.
  seedValue?: string;
  // The value written with typecast on.
  writtenValue: unknown;
  // What the cell must read afterwards. `null` means the field refused to
  // invent a value, which for these three is the whole point.
  expectedStored: unknown;
  // The rating field's maximum, when there is one.
  ratingMax: number;
}

// A link cell written in the shape v1 accepted - an array for a single-value
// link, a bare object for a multi-value one. v2's strict path rejected both,
// so integrations written against v1 started answering 400 on the field that
// connects two tables.
export interface LinkCellShapeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which tolerance is being asked for. "nullTitle" is a different fix with
  // the same shape of failure: a link to a row whose primary cell is empty is
  // stored as {id, title: null}, and write validation rejected the null title.
  shape: "arrayIntoSingle" | "objectIntoMulti" | "nullTitle";
}

// A number column converted into a rating field. A rating is whole stars
// between one and its maximum, and the conversion has to answer for every
// value already in the column: a fraction, a number past the maximum, a zero.
export interface RatingConversionCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  ratingMax: number;
  // `before` is what the number column holds, `after` what the rating must
  // read once converted. At least one value has to be outside the rating's
  // domain, or the conversion would have nothing to normalize.
  rows: { name: string; before: number | null; after: number | null }[];
}

// A client watching a view's rows while that view is sorted. The sort rewrites
// the view's row order with raw SQL and told no subscriber, so the click
// looked dead and a refresh served the cached pre-sort order back.
export interface ManualSortRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // One number per row, in the order the rows are created. At least three, and
  // not already ascending - sorting an already-sorted fixture pushes nothing
  // and would pass on every commit.
  rowRanks: number[];
  // How long the client may take to attach. Failing to subscribe is a fixture
  // failure, not a reproduction.
  subscribeTimeoutMs: number;
  // How long the sorted order may take to arrive.
  settleTimeoutMs: number;
}

// A table created with two link fields pointing at the same other table. Each
// link puts a column on that other table, and the names for those columns were
// planned against the table as it stood before the request rather than as the
// request was building it.
export interface RepeatedForeignLinksCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The link fields on the new table, all pointing at the same reference
  // table. At least two, and named differently from each other - the case is
  // about the columns they create on the other side.
  linkFieldNames: string[];
}

// A table holding a field whose id body is not the length this version
// generates - what an imported or migrated base carries, because v1 only
// enforced the prefix. A field id is part of every query built against its
// table, so one unparseable field is a table nobody can read.
export interface LegacyFieldIdCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The id the field is given. Must keep the `fld` prefix and must not have a
  // canonical 16-character body; the runner refuses both.
  legacyFieldId: string;
  seedValue: string;
  updatedValue: string;
}

// A single-select carried across two tables by lookups, and a rename of the
// last one. A select field is its choices; a lookup of one carries that list
// along, and renaming the column dropped it.
export interface NestedLookupRenameCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The choices on the source select. At least two: a single-choice list
  // losing its colors and a list losing everything are hard to tell apart.
  choiceNames: string[];
  renamedTo: string;
}

// A column deleted long before the table was trashed, and the table restored.
// Restoring looked for everything marked deleted rather than for what the
// table's own delete had taken, so the old column came back too.
export interface TableRestoreScopeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // How far back the old deletion is dated. At least one hour: deleted in the
  // same moment as the table, the two are indistinguishable by time, and a
  // case that cannot tell them apart would pass on a build that restores
  // everything.
  backdateHours: number;
  trashVisibleTimeoutMs: number;
  pollIntervalMs: number;
}

// A rollup over linked rows narrowed with a condition. Converting the field
// mapped its link and lookup ids and dropped the filter, so the condition
// never persisted and the column went on totalling everything.
export interface RollupFilterPersistsCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The category the condition counts. At least one linked row must carry it
  // and at least one must not, or a dropped filter and an applied one give the
  // same total.
  countedCategory: string;
  items: { name: string; category: string; amount: number }[];
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A lookup pointing at a date column, repointed at a text column. The two are
// stored differently underneath and the lookup's own storage was left as it
// was, so what came back afterwards was not the text it now points at.
export interface LookupRetargetCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // What the source row holds in each column. The date is what the lookup
  // shows first; the text is what it must show after being repointed.
  dateValue: string;
  textValue: string;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A required column with a default value. "Required" and "has a default"
// belong together - the default is the answer for everyone who does not supply
// one - and the order was wrong in two places, each rejecting an ordinary
// request.
export interface RequiredDefaultCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // "onCreate": a record created without the column. "onAddField": the column
  // added to a table that already holds rows.
  moment: "onCreate" | "onAddField";
  defaultValue: string;
}

// A date filter sent as a plain date string, the way v1 took it and v1-era
// clients still send it. v2 did not recognise the bare string, so the filter
// matched nothing - and an empty result reads as "there is nothing there".
export interface LegacyDateFilterCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Display zone of the date column. Pinned so the dates read the same
  // everywhere rather than being load-bearing.
  timeZone: string;
  // The rows, and which date the filter asks for. At least one row must be on
  // that date and at least one must not, so an empty answer and an unfiltered
  // one are both caught.
  rows: { name: string; date: string }[];
  filterDate: string;
}

// A formula reading a date that came from another table. A lookup of a date is
// stored as json rather than as a date, and the formula had to unwrap it
// before treating it as one - so the computed update failed, and a failed
// computed task takes the table's other computed columns with it.
export interface FormulaOverDateLookupCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The source row's date and status, before and after the write. Each pair
  // has to differ, or the write queues no recompute and the columns would
  // still read what the first pass put there.
  dateBefore: string;
  dateAfter: string;
  statusBefore: string;
  statusAfter: string;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A column whose name has capital letters, and a request for its total.
// Postgres folds an unquoted identifier to lower case, so such a column is
// only findable if the query quotes it - and the aggregation query did not.
export interface AggregationMixedCaseCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The field's name, which the physical column follows. Must contain capital
  // letters, or an unquoted identifier folds to itself and the query finds it
  // either way.
  fieldName: string;
  // Which column shape. A plain number column is summed and is green on both
  // sides of the fix; a multi-valued one goes through the adapter the fix
  // touches and is counted by how many rows have anything in it.
  column: "number" | "multiSelect";
  amounts: number[];
  // The choices, and what each row selects, for the multi-valued shape.
  tags: string[];
  rowTags: string[][];
}

// A checkbox that defaults to ticked, and the edit that clears that default.
// The field's schema only accepted true or false, so saying "no default" -
// which is null, not false - was refused.
export interface CheckboxClearedDefaultCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // What the column defaults to before the edit. There has to be a default to
  // clear, or the case would pass anywhere.
  startsTicked: boolean;
}

// A sheet whose first line is data rather than a header, imported with the
// dialog's switch set to say so. The first line was dropped anyway.
export interface CsvHeadersDisabledCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Which entry point. The fix is in the handler that creates the table as it
  // goes; "inplace" adds the lines to a table that already exists and keeps
  // the first line on both columns.
  mode: "inplace" | "newTable";
  // The lines of the sheet. At least two: with one, a dropped first line and
  // an import that did nothing look the same.
  rows: { ref: string; note: string }[];
}

// A link field renamed and nothing else. A link's configuration is what makes
// it a link - which table it reaches, how many rows it holds, the column it
// put on the other side - and a rename says nothing about any of it.
export interface LinkRenameKeepsConfigCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // How the rename is sent. "patchName" is a partial update carrying only the
  // name, which is what the fix is about; "convertWholeField" sends the whole
  // configuration alongside and is green on both columns.
  request: "patchName" | "convertWholeField";
  // The new name. Must differ from the old one, or nothing is being renamed.
  renamedTo: string;
}

// A column that refuses duplicates, told to stop. Turning the switch on builds
// something in the database to enforce it; turning it off has to take that
// away, and it did not.
export interface UniqueToggleCleanupCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Whether a second, standalone unique index over the same column is written
  // first, named the way an older version named them. Bases carry these, and
  // they are the other half of the same issue.
  withLegacyIndex: boolean;
  // The value written twice.
  code: string;
}

// A client watching a row while several of its cells change in one edit. The
// change went out as one message per cell, and only some survived, so everyone
// else saw a row half-updated.
export interface MultiFieldUpdateRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // How many cells the edit changes. At least three: with two, losing one and
  // applying them in a different order are hard to tell apart.
  cellCount: number;
  beforePrefix: string;
  afterPrefix: string;
  subscribeTimeoutMs: number;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A base carried out and back in through export and import. The field
// descriptions - the instructions whoever fills the rows reads - were dropped
// on the way, and the copy looks complete without them.
export interface BaseImportFieldDescriptionCaseConfig {
  // "describedFields" carries a table whose fields have descriptions;
  // "noTables" carries a base with no table at all, which the import refused
  // outright. Both are the same commit.
  shape: "describedFields" | "noTables";
  namePrefix: string;
  rowTitle: string;
  describedFields: { name: string; description: string }[];
  // A field created with no description, so "every field has one" cannot be
  // satisfied by inventing them.
  undescribedFieldName: string;
}

// A member column matched every email typed into it against every account on
// the platform, so anyone with an account could be written into a base they
// have nothing to do with.
export interface UserWriteScopeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  outsiderName: string;
  // The control row, naming someone who does belong to this base. Without it
  // an empty cell would prove nothing.
  insiderRowTitle: string;
  outsiderRowTitle: string;
}

// A link column whose foreign table is no longer physically there. Removing
// the column reaches across to that table's storage, so the delete failed and
// the column could not be taken off at all.
export interface OrphanLinkFieldDeleteCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  hostRowTitle: string;
  foreignRowTitle: string;
  // A plain column beside the link, so a delete that took the rest of the
  // table with it is caught as well.
  neighbourFieldName: string;
}

// A text column holding a few values that are not dates, converted to a date
// column. One impossible value was enough to stop the whole conversion.
export interface TextToDateConversionCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // "empty" for a value that is not a date and has to end up cleared,
  // "date" for one that has to survive. The fixture needs both.
  rows: { name: string; text: string; becomes: "empty" | "date" }[];
}

// A button column's label, colour, cap and confirmation dialog - presentation
// and click policy - edited while every row already carries a click count. The
// edit was treated as a change to what the column holds, so the counts were
// rewritten.
export interface ButtonDisplayChangeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitles: string[];
  // Something other than zero, or a wiped count and the seeded one are the
  // same number.
  seededCount: number;
  labelBefore: string;
  labelAfter: string;
  colorBefore: string;
  colorAfter: string;
  maxCountBefore: number;
  maxCountAfter: number;
  confirmTitle: string;
  confirmDescription: string;
}

// A link column configured to show certain columns of the table it points at.
// Not ticking the name column took the name out of the picker, leaving rows
// identified by the extra column alone.
export interface LinkPickerPrimaryFieldCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  hostRowTitle: string;
  linkFieldName: string;
  shownFieldName: string;
  // A third column, ticked by nobody: the picker must not answer with
  // everything either.
  hiddenFieldName: string;
  rows: { name: string; shown: string; hidden: string }[];
}

// A rollup column on a table whose storage predates the current layout,
// renamed. The rename recomputed the whole column, and the recompute cannot be
// written into that older storage, so the rename was refused.
export interface RollupMetadataRenameCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  hostRowTitle: string;
  amounts: number[];
  renamedTo: string;
  newDescription: string;
}

// A column that fills new rows in with a value, and the edit that takes that
// value away. Only text columns accepted it; every other type treated "no
// default" as "leave it alone".
export interface ClearedDefaultCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  column: "number" | "date" | "singleSelect";
  numberDefault: number;
  // A date column's default is "now"; the zone is what its formatting says.
  timeZone: string;
  // The first choice is the default; the list needs a second one so a default
  // is a choice rather than the only possibility.
  choices: string[];
  rowBeforeTitle: string;
  rowAfterTitle: string;
}

// A table whose "created by" column is one the database fills in itself, the
// way tables migrated from the previous version carry it. The product wrote
// the author in on every insert, and Postgres refused the whole insert.
export interface LegacyGeneratedAuditColumnCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
}

// A table left marked as broken when its creation failed part way through.
// Delete looked for a working table, did not find one, and refused - so the
// half-made table could not be cleaned up.
export interface DeleteErrorStateTableCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
}

// A link pointing at a table whose first column is worked out rather than
// typed. Matching a pasted name against it was refused, so the ordinary way of
// filling a link column in failed on exactly those tables.
export interface LinkPasteFormulaTitleCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  hostRowTitle: string;
  prefix: string;
  foreignRows: string[];
}

// A formula column the database works out itself, the way tables carried over
// from the previous version store them. The product recalculated it by writing
// into it, the write was refused, and the edit that triggered it went too.
export interface GeneratedFormulaColumnCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
  quantityBefore: number;
  quantityAfter: number;
}

// Deleting a row has to clear it out of every cell that pointed at it. The
// clearing skipped link columns carrying the stored shape an older version
// wrote, leaving cells that name a row which is not there.
export interface IncomingLinkCleanupCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  deletedRowTitle: string;
  // A second row on the far side, pointed at by a second cell: the delete has
  // to leave that one alone.
  keptRowTitle: string;
  pointingRowTitle: string;
  otherRowTitle: string;
}

// A formula left marked broken when the column it read was deleted, then
// repointed at another column. The repair was accepted without the mark being
// cleared, so the column kept its warning and its old values.
export interface FormulaErrorRepairCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
  // Different text in the two columns, or a formula still reading the deleted
  // one and a formula reading the new one give the same answer.
  sourceValue: string;
  fallbackValue: string;
}

// A choice retired from a status column. Nothing was pushed for the rows that
// held it, so open screens went on showing a status the column no longer
// offers - unfilterable and unchoosable - until a reload.
export interface SelectOptionRemovalRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  retiredChoice: string;
  keptChoice: string;
  retiredRowTitle: string;
  keptRowTitle: string;
  subscribeTimeoutMs: number;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// Rows added to an existing table from a file. Nothing told the table's
// worked-out columns that new rows had arrived, so the imported rows carried
// the values from the file and nothing else.
export interface AppendImportComputedCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The row that is already in the table - the control, which has to keep its
  // worked-out value throughout.
  existingRow: { ref: string; amount: number };
  importedRows: { ref: string; amount: number }[];
  multiplier: number;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A sorted view where every row ties on the sorted column, with one row
// dragged out of place. Operations addressed by position resolved the tie
// differently from the grid, so they landed on a row nobody had selected.
export interface TiedSortOffsetCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Every row carries this, so the sort decides nothing and the view's own
  // row order decides everything.
  sharedStatus: string;
  rowTitles: string[];
  draggedRowTitle: string;
  pastedValue: string;
}

// A form whose settings mark a column the product fills in itself as required.
// Every submission was refused for a column the person filling the form cannot
// see and could not fill in.
export interface FormRequiredComputedCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  submittedName: string;
}

// A change to a lookup column's settings, pushed to the page that has those
// settings open. What went out was a stripped-down copy the page has to
// reject, so the dialog went on showing the old setting until a reload.
export interface LookupConfigRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  hostRowTitle: string;
  foreignRowTitle: string;
  firstValue: string;
  secondValue: string;
  subscribeTimeoutMs: number;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A member column widened from one person to several. The column starts
// holding a list; a formula reading it went on producing what it produced for
// one person, so the two disagree about their shape.
export interface UserMultiplicityFormulaCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A grouped view, and an operation addressed by position. The operation worked
// out which rows it meant without applying the grouping, so it counted from a
// different order than the screen shows.
export interface GroupedRangeOffsetCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Created in an order that interleaves the groups, so grouping genuinely
  // rearranges them.
  rows: { name: string; group: string }[];
  groupOrder: "asc" | "desc";
  pasteAtOffset: number;
  pastedValue: string;
}

// A column change the data refuses. The failure is correct; what followed was
// not - the table was left marked as not finished being set up, and everything
// after it was refused.
export interface TableUsableAfterFailedUpdateCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Has to contain an empty cell, or the change would succeed and there would
  // be no failure to recover from.
  values: string[];
  rowAddedAfter: string;
  valueAddedAfter: string;
  renamedTo: string;
}

// A table other tables link to, trashed and restored. The restore brought the
// table back and left the columns pointing at it behind - no longer links, no
// longer holding the row they pointed at.
export interface RestoreInboundLinkCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  hostRowTitle: string;
  foreignRowTitle: string;
  foreignDetail: string;
  settleTimeoutMs: number;
  pollIntervalMs: number;
}

// A text column with an entry longer than a choice name may be, turned into a
// list of choices. The long entry became an option: a paragraph in the
// dropdown, in every filter and in every colour rule.
export interface OversizedSelectChoiceCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The product's limit on how long a choice name may be.
  limit: number;
  oversizedLength: number;
  shortValues: [string, string];
}

// A date column in a time zone named the way older systems name it. The
// accepted list held only the current names, so the request was refused.
export interface TimezoneAliasCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // An older name for a zone that is still what many systems send.
  aliasZone: string;
  value: string;
}

// A column duplicated while other people have the table open. Nothing
// announced the copy, so it was invisible to them until a reload.
export interface DuplicateFieldRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
  copyName: string;
  subscribeTimeoutMs: number;
  settleTimeoutMs: number;
}

// Assigning someone in a member column has to tell them. Nothing was sent, so
// the row said the work was theirs and they had no way to know.
export interface UserFieldNotifyOnAssignCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
  notifyTimeoutMs: number;
  pollIntervalMs: number;
}

// A view saved with the filter "assigned to me". The word was passed to the
// database as itself, matched nobody, and the view came back empty.
export interface MeFilterInViewCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  mineRowTitle: string;
  unassignedRowTitle: string;
}

// A status column whose stored settings list the same choice twice - what an
// import that ran twice or a merged option list leaves behind. Reading the
// table then failed outright, for every row and everyone.
export interface DuplicateSelectChoiceCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  repeatedChoice: string;
  otherChoice: string;
  rowTitles: string[];
}

// The gap between two dates, written without naming a unit. The language
// promises seconds; the answer came back in days - the same number divided by
// 86,400, with nothing marking it as the wrong unit.
export interface DatetimeDiffDefaultUnitCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
  started: string;
  finished: string;
  timeZone: string;
}

// A relative date filter - "today". Asking for it was not understood, so the
// answer was everything or nothing, and both look ordinary.
export interface IsWithinTodayFilterCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  yesterdayRowTitle: string;
  todayRowTitle: string;
  tomorrowRowTitle: string;
  timeZone: string;
}

// One write covering several rows, mentioning a column for some of them and
// not for others. The rows that did not mention it had it cleared, with
// nothing failing and nothing reported.
export interface SparseBatchUpdateCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  untouchedRowTitle: string;
  writtenRowTitle: string;
  statusKept: string;
  statusWritten: string;
  notesBefore: string;
  notesAfter: string;
}

// A column looking up a total worked out on another table, whose stored
// settings lost the rule for that total. Adding a row, listing rows and
// opening the view were all refused, with a message about a rule the user
// never wrote.
export interface SingleFieldPendingStateCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
  memberName: string;
  memberHandle: string;
  // How long to let the worked-out columns settle before looking. Until they
  // have, "still busy" is the correct answer - see the runner.
  settleAttempts: number;
  settleIntervalMs: number;
}

export interface DeleteWithoutUndoCaptureCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  deletedRowName: string;
  // A row that is never deleted, so a delete that took the whole table and a
  // delete that took the right row are distinguishable.
  keptRowName: string;
}

export interface LookupOfLinkContainsCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Two names sharing no letters, so a filter that matched everything and one
  // that matched the right row cannot be confused. The search term is part of
  // the first and not of the second - the runner refuses anything else.
  targetNames: string[];
  searchTerm: string;
}

export interface TrackedModifiedSortCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Three rows at least - see the runner. They are touched oldest first.
  rowNames: string[];
  // How long to wait between touching rows, so the stored times differ at the
  // second the column is formatted to.
  stepMs: number;
}

export interface FormulaOverSystemColumnsCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  rowTitle: string;
}

export interface ConditionalRollupUserMatchCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  staffedRowName: string;
  emptyRowName: string;
  // Hours on tasks the person owns, and on tasks nobody owns. Both lists have
  // to hold something - see the runner.
  ownedHours: number[];
  unownedHours: number[];
  settleAttempts: number;
  settleIntervalMs: number;
}

export interface NestedFilterConjunctionCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // One row per value. Both wanted values have to be present, they have to
  // differ, and at least one row has to hold neither - see the runner.
  statuses: number[];
  firstWanted: number;
  secondWanted: number;
}

export interface StaleViewColumnMetaCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The column that is deleted and whose setting is left behind.
  deletedColumnName: string;
}

export interface LongtextMarkdownConvertCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The one thing the edit actually changes. It has to differ from the
  // column's name - see the runner.
  renamedTo: string;
}

export interface DuplicateBaseRecentListCaseConfig {
  baseNamePrefix: string;
}

export interface BooleanFormulaFilterCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Rows on both sides of the line, and one with no amount at all - the
  // runner refuses anything else.
  rows: { name: string; amount: number | null }[];
  threshold: number;
  settleAttempts: number;
  settleIntervalMs: number;
}

export interface LookupSelectChoicesKeptCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // Two choices at least - see the runner.
  choices: string[];
}

export interface ShareCopyOutsidePanelCaseConfig {
  baseNamePrefix: string;
  folderName: string;
  insideTableName: string;
  outsideTableName: string;
  insidePanelName: string;
  outsidePanelName: string;
}

export interface RowCountSearchProjectionCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The term has to match in the visible column on at least one row, and in
  // the hidden column on at least one row it does not match visibly - the
  // runner refuses anything else.
  rows: { title: string; note: string }[];
  searchTerm: string;
}

export interface ManyoneTypecastShapeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  targetName: string;
  pickedRowName: string;
  typedRowName: string;
}

export interface LinkPickerShareLookupCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  targetRowName: string;
}

export interface LookupMultiplicityVoCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  hostRowName: string;
  // Two linked rows at least - see the runner.
  linkedRowNames: string[];
}

export interface ProjectedGroupHeadersCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // One entry per row, naming the group it belongs to. Two different statuses
  // at least - see the runner.
  rowStatuses: string[];
}

export interface ArchiveRecountCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // One counted row per owner. Two owners at least - see the runner.
  owners: string[];
  settleAttempts: number;
  settleIntervalMs: number;
}

export interface TableDeleteRealtimeCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // How long the watched list may take to carry both fixture tables, and how
  // long the delete may take to reach the page.
  settleTimeoutMs: number;
  announceTimeoutMs: number;
}

export interface EmptyWriteNormalizationCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  filledRowName: string;
  untouchedRowName: string;
  notes: string;
  tags: string[];
}

export interface AiConfigOnlyChangePlanCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  // The instruction behind the column, and the model it names. The new model
  // has to differ from the old one - see the runner.
  modelKey: string;
  newModelKey: string;
  prompt: string;
}

export interface LookupOfRollupCreateCaseConfig {
  baseId: "seed-base";
  tableNamePrefix: string;
  ownerTitle: string;
  usageRowTitle: string;
  firstAmount: number;
  secondAmount: number;
}
