import smokeAuthUserCase from "./cases/smoke/auth-user.case";
import recordBulkUpdate100MixedLandsCase from "./cases/record/bulk-update-100-mixed-lands.case";
import recordCollapsedDateGroupStaysHiddenCase from "./cases/record/collapsed-date-group-stays-hidden.case";
import baseShareSaveIntoExistingBaseTwiceCase from "./cases/base-share/save-into-existing-base-twice.case";
import viewIncompleteFilterConditionSurvivesCase from "./cases/view/incomplete-filter-condition-survives.case";
import filterScalarLookupNoneOfLoadsCase from "./cases/filter/scalar-lookup-none-of-loads.case";
import lookupUserSnapshotDateSortSpansGroupCase from "./cases/lookup/user-snapshot-date-sort-spans-group.case";
import formulaScalarValueOverLinkedTextCase from "./cases/formula/scalar-value-over-linked-text.case";
import linkRequiredLinkKeepsSiblingRefreshCase from "./cases/link/required-link-keeps-sibling-refresh.case";
import linkOneoneDeleteKeepsTableReadableCase from "./cases/link/oneone-delete-keeps-table-readable.case";
import tableTrashDegradesInboundLinkCase from "./cases/table/trash-degrades-inbound-link.case";
import linkRequiredLinkBlocksOwnerDeleteCase from "./cases/link/required-link-blocks-owner-delete.case";
import recordLegacyUniqueViolationNamesFieldCase from "./cases/record/legacy-unique-violation-names-field.case";
import userFieldPasteNonCollaboratorValueCase from "./cases/user-field/paste-non-collaborator-value.case";
import userFieldGroupFoldsDriftedSnapshotsCase from "./cases/user-field/group-folds-drifted-snapshots.case";
import userFieldGroupKeepsLegacyIdOutOfEmptyCase from "./cases/user-field/group-keeps-legacy-id-out-of-empty.case";
import userFieldGroupKeepsUnwrappedCellOutOfEmptyCase from "./cases/user-field/group-keeps-unwrapped-cell-out-of-empty.case";
import lookupStaleTextMetadataRecastsOnRebuildCase from "./cases/lookup/stale-text-metadata-recasts-on-rebuild.case";
import lookupStaleTextMetadataSurvivesDisplayConvertCase from "./cases/lookup/stale-text-metadata-survives-display-convert.case";
import lookupNullMultiplicityScalarRefreshesCase from "./cases/lookup/null-multiplicity-scalar-refreshes.case";
import lookupNullMultiplicityScalarConvertsCase from "./cases/lookup/null-multiplicity-scalar-converts.case";
import importExcelDuplicateHeadersCase from "./cases/import/excel-duplicate-headers.case";
import auditFieldsLastModifiedByResolvesNameCase from "./cases/audit-fields/last-modified-by-resolves-name.case";
import realtimeViewFilterUpdateReachesSubscribersCase from "./cases/realtime/view-filter-update-reaches-subscribers.case";
import realtimeViewGroupAndSortReachSubscribersCase from "./cases/realtime/view-group-and-sort-reach-subscribers.case";
import undoDeleteRecordsUndoRestoresAllCase from "./cases/undo/delete-records-undo-restores-all.case";
import linkCrossBaseLinkClearsOnDeleteCase from "./cases/link/cross-base-link-clears-on-delete.case";
import importExcelHeaderBelowA1Case from "./cases/import/excel-header-below-a1.case";
import selectionPasteByIdLandsOnItsOwnRowsCase from "./cases/selection/paste-by-id-lands-on-its-own-rows.case";
import searchStaysInsideViewFilterCase from "./cases/search/stays-inside-view-filter.case";
import lookupRollupFilterCase from "./cases/lookup/rollup-condition-is-saved-and-applied.case";
import lookupRetargetCase from "./cases/lookup/repointed-lookup-shows-its-new-target.case";
import tableRestoreScopeCase from "./cases/table/restore-brings-back-only-its-own-delete.case";
import fieldLegacyIdTableCase from "./cases/field/legacy-field-id-table-still-works.case";
import lookupNestedRenameCase from "./cases/lookup/renaming-a-nested-lookup-keeps-its-choices.case";
import realtimeManualSortCase from "./cases/realtime/manual-sort-reaches-the-open-page.case";
import fieldRatingConversionCase from "./cases/field/rating-conversion-normalizes-existing-values.case";
import linkTwoToOneTableCase from "./cases/link/two-links-to-one-table-get-two-columns.case";
import lookupConditionalForeignRefCase from "./cases/lookup/conditional-filter-over-a-foreign-table.case";
import recordInvalidDateCase from "./cases/record/invalid-date-is-not-invented.case";
import recordRatingDomainCase from "./cases/record/rating-is-stored-in-whole-stars.case";
import linkSingleArrayCase from "./cases/link/single-link-accepts-a-one-entry-array.case";
import linkMultiObjectCase from "./cases/link/multi-link-accepts-a-bare-object.case";
import linkNullTitleCase from "./cases/link/link-to-a-row-without-a-name-rewrites.case";
import recordLegacyIdStillComputesCase from "./cases/record/legacy-id-row-still-computes.case";
import lookupConditionalRestoreCase from "./cases/lookup/conditional-lookup-survives-restore.case";
import viewAddedFieldLandsLastCase from "./cases/view/added-field-lands-after-legacy-columns.case";
import fieldDeleteSparesSharedColumnCase from "./cases/field/delete-spares-a-field-sharing-its-column.case";
import recordRepeatedDeleteIsIdempotentCase from "./cases/record/repeated-delete-is-idempotent.case";
import tableDuplicateWithSharedViewCase from "./cases/table/duplicate-with-shared-view.case";
import selectionPasteAcrossPendingFieldCase from "./cases/selection/paste-across-pending-field.case";
import selectionPasteByIdAcrossPendingFieldCase from "./cases/selection/paste-by-id-across-pending-field.case";
import tableTrashDegradesInboundLinkWithoutDisplayColumnCase from "./cases/table/trash-degrades-inbound-link-without-display-column.case";
import userFieldImportDoesNotNotifyAssigneeCase from "./cases/user-field/import-does-not-notify-assignee.case";
import userFieldTableDuplicateDoesNotNotifyAssigneeCase from "./cases/user-field/table-duplicate-does-not-notify-assignee.case";
import userFieldUndoOfDeleteDoesNotRenotifyAssigneeCase from "./cases/user-field/undo-of-delete-does-not-renotify-assignee.case";
import userFieldUndoOfClearDoesNotRenotifyAssigneeCase from "./cases/user-field/undo-of-clear-does-not-renotify-assignee.case";
import userFieldAssignmentBurstArrivesCoalescedCase from "./cases/user-field/assignment-burst-arrives-coalesced.case";
import type { BugCase } from "./framework/types";

// Every runnable case, registered explicitly. scripts/case-catalog.mjs parses
// this file statically (imports + the array below), so the planner and the
// checks can enumerate cases without resolving @teable/* packages.
const cases = [
  smokeAuthUserCase,
  recordBulkUpdate100MixedLandsCase,
  recordCollapsedDateGroupStaysHiddenCase,
  baseShareSaveIntoExistingBaseTwiceCase,
  viewIncompleteFilterConditionSurvivesCase,
  filterScalarLookupNoneOfLoadsCase,
  lookupUserSnapshotDateSortSpansGroupCase,
  formulaScalarValueOverLinkedTextCase,
  linkRequiredLinkKeepsSiblingRefreshCase,
  linkOneoneDeleteKeepsTableReadableCase,
  tableTrashDegradesInboundLinkCase,
  linkRequiredLinkBlocksOwnerDeleteCase,
  recordLegacyUniqueViolationNamesFieldCase,
  userFieldPasteNonCollaboratorValueCase,
  lookupStaleTextMetadataRecastsOnRebuildCase,
  lookupStaleTextMetadataSurvivesDisplayConvertCase,
  lookupNullMultiplicityScalarRefreshesCase,
  lookupNullMultiplicityScalarConvertsCase,
  importExcelDuplicateHeadersCase,
  auditFieldsLastModifiedByResolvesNameCase,
  realtimeViewFilterUpdateReachesSubscribersCase,
  realtimeViewGroupAndSortReachSubscribersCase,
  undoDeleteRecordsUndoRestoresAllCase,
  linkCrossBaseLinkClearsOnDeleteCase,
  importExcelHeaderBelowA1Case,
  selectionPasteByIdLandsOnItsOwnRowsCase,
  searchStaysInsideViewFilterCase,
  lookupRollupFilterCase,
  lookupRetargetCase,
  tableRestoreScopeCase,
  fieldLegacyIdTableCase,
  lookupNestedRenameCase,
  realtimeManualSortCase,
  fieldRatingConversionCase,
  linkTwoToOneTableCase,
  lookupConditionalForeignRefCase,
  recordInvalidDateCase,
  recordRatingDomainCase,
  linkSingleArrayCase,
  linkMultiObjectCase,
  linkNullTitleCase,
  recordLegacyIdStillComputesCase,
  lookupConditionalRestoreCase,
  viewAddedFieldLandsLastCase,
  fieldDeleteSparesSharedColumnCase,
  recordRepeatedDeleteIsIdempotentCase,
  tableDuplicateWithSharedViewCase,
  userFieldGroupFoldsDriftedSnapshotsCase,
  userFieldGroupKeepsLegacyIdOutOfEmptyCase,
  userFieldGroupKeepsUnwrappedCellOutOfEmptyCase,
  selectionPasteAcrossPendingFieldCase,
  selectionPasteByIdAcrossPendingFieldCase,
  tableTrashDegradesInboundLinkWithoutDisplayColumnCase,
  userFieldImportDoesNotNotifyAssigneeCase,
  userFieldTableDuplicateDoesNotNotifyAssigneeCase,
  userFieldUndoOfDeleteDoesNotRenotifyAssigneeCase,
  userFieldUndoOfClearDoesNotRenotifyAssigneeCase,
  userFieldAssignmentBurstArrivesCoalescedCase,
] satisfies BugCase[];

const caseById = new Map<string, BugCase>(
  cases.map((bugCase) => [bugCase.id, bugCase]),
);

if (caseById.size !== cases.length) {
  throw new Error("Duplicate case ids in registry.ts");
}

export const listBugCaseIds = () => cases.map((bugCase) => bugCase.id);

// Filter semantics are deliberately minimal — exact ids, comma-separated, or
// "all" — and duplicated in scripts/case-catalog.mjs for the planner. Keeping
// both resolvers this trivial is what keeps them aligned; aliases and globs
// would give them room to drift.
export const resolveBugCaseIds = (caseFilter = "all"): string[] => {
  const trimmed = caseFilter.trim();
  if (!trimmed || trimmed === "all" || trimmed === "*") {
    return listBugCaseIds();
  }

  const caseIds = [
    ...new Set(
      trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];

  const unknown = caseIds.filter((caseId) => !caseById.has(caseId));
  if (unknown.length > 0) {
    throw new Error(
      `Unsupported E2E_LAB_CASE_FILTER: ${unknown.join(", ")}. ` +
        `Available cases: ${listBugCaseIds().join(", ")}, or "all".`,
    );
  }

  return caseIds;
};

export const getBugCase = (caseId: string): BugCase => {
  const bugCase = caseById.get(caseId);
  if (!bugCase) {
    throw new Error(
      `Unknown case id: ${caseId}. Available: ${listBugCaseIds().join(", ")}`,
    );
  }
  return bugCase;
};

export const listBugCases = (caseFilter?: string) =>
  resolveBugCaseIds(caseFilter).map(getBugCase);
