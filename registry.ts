import smokeAuthUserCase from "./cases/smoke/y153-auth-user.case";
import recordBulkUpdate100MixedLandsCase from "./cases/record/y154-bulk-update-100-mixed-lands.case";
import lookupOfRollupCreateCase from "./cases/record/y334-a-row-when-a-looked-up-total-lost-its-rule.case";
import aiConfigOnlyChangePlanCase from "./cases/field/y336-change-only-the-instruction-behind-a-column.case";
import emptyWriteNormalizationCase from "./cases/record/y566-clear-a-cell-and-have-it-count-as-empty.case";
import tableDeleteCollaboratorRecoveryCase from "./cases/table/y248-collaborator-leaves-deleted-table.case";
import archiveRecountCase from "./cases/record/y1-archive-the-rows-a-count-was-counting.case";
import projectedGroupHeadersCase from "./cases/view/y569-a-grouped-view-asked-for-one-column.case";
import lookupMultiplicityVoCase from "./cases/lookup/y340-a-borrowed-people-column-over-many-rows.case";
import linkPickerShareLookupCase from "./cases/link/y570-the-picker-behind-a-borrowed-link.case";
import manyoneTypecastShapeCase from "./cases/link/y571-fill-a-one-row-link-in-by-name.case";
import rowCountSearchProjectionCase from "./cases/search/y572-how-many-results-with-a-column-hidden.case";
import shareCopyOutsidePanelCase from "./cases/base-share/y574-copy-a-share-past-a-panel-outside-it.case";
import lookupSelectChoicesKeptCase from "./cases/lookup/y575-repoint-a-borrowed-choice-column.case";
import booleanFormulaFilterCase from "./cases/filter/y576-filter-a-worked-out-yes-no-column.case";
import duplicateBaseRecentListCase from "./cases/base-share/y577-a-duplicated-base-in-the-recent-list.case";
import fieldOptionPreservationCase from "./cases/field/y422-y428-field-options-survive-edits.case";
import departmentShareUserPickerCase from "./cases/base-share/y429-department-member-appears-in-share-picker.case";
import staleViewColumnMetaCase from "./cases/view/y578-a-view-that-still-describes-a-deleted-column.case";
import nestedFilterConjunctionCase from "./cases/filter/y579-a-group-inside-a-group.case";
import conditionalRollupUserMatchCase from "./cases/lookup/y565-hours-owned-by-anyone-on-this-row.case";
import weekdayStartDayCase from "./cases/formula/y563-a-day-number-when-weeks-start-on-monday.case";
import fromnowUnitCase from "./cases/formula/y556-how-long-ago-in-days.case";
import formulaOverSystemColumnsCase from "./cases/formula/y564-columns-worked-out-from-a-new-row.case";
import trackedModifiedSortCase from "./cases/view/y568-sort-by-a-narrowed-last-changed-column.case";
import lookupOfLinkContainsCase from "./cases/filter/y173-search-a-borrowed-link-column.case";
import deleteWithoutUndoCaptureCase from "./cases/record/y567-delete-a-row-whose-undo-bookkeeping-is-missing.case";
import singleFieldPendingStateCase from "./cases/field/y337-a-settled-column-read-on-its-own.case";
import sparseBatchUpdateCase from "./cases/record/y331-a-batch-write-leaves-what-it-did-not-mention.case";
import generatedFormulaColumnCase from "./cases/record/y244-edit-a-cell-behind-a-generated-formula.case";
import legacyGeneratedAuditColumnCase from "./cases/record/y241-add-a-row-to-a-legacy-table.case";
import recordCollapsedDateGroupStaysHiddenCase from "./cases/record/y155-collapsed-date-group-stays-hidden.case";
import baseShareSaveIntoExistingBaseTwiceCase from "./cases/base-share/y156-save-into-existing-base-twice.case";
import baseImportFieldDescriptionCase from "./cases/base-share/y230-import-keeps-field-descriptions.case";
import baseImportNoTablesCase from "./cases/base-share/y231-import-of-a-base-without-tables.case";
import viewIncompleteFilterConditionSurvivesCase from "./cases/view/y157-incomplete-filter-condition-survives.case";
import meFilterInViewCase from "./cases/view/y329-a-view-filtered-to-me.case";
import formRequiredComputedCase from "./cases/view/y319-a-form-with-a-required-automatic-column.case";
import filterScalarLookupNoneOfLoadsCase from "./cases/filter/y158-scalar-lookup-none-of-loads.case";
import isWithinTodayFilterCase from "./cases/filter/y332-a-filter-that-says-today.case";
import lookupUserSnapshotDateSortSpansGroupCase from "./cases/lookup/y159-user-snapshot-date-sort-spans-group.case";
import rollupMetadataRenameCase from "./cases/lookup/y237-rename-a-rollup-keeps-its-total.case";
import formulaScalarValueOverLinkedTextCase from "./cases/formula/y160-scalar-value-over-linked-text.case";
import datetimeDiffDefaultUnitCase from "./cases/formula/y333-a-gap-between-two-dates.case";
import userMultiplicityFormulaCase from "./cases/formula/y321-formula-follows-a-user-column-widening.case";
import formulaErrorRepairCase from "./cases/formula/y246-repairing-a-formula-clears-its-error.case";
import linkRequiredLinkKeepsSiblingRefreshCase from "./cases/link/y161-required-link-keeps-sibling-refresh.case";
import incomingLinkCleanupCase from "./cases/link/y245-deleting-a-row-clears-links-pointing-at-it.case";
import linkPasteFormulaTitleCase from "./cases/link/y243-paste-a-name-that-is-worked-out.case";
import linkPickerPrimaryFieldCase from "./cases/link/y236-picker-keeps-the-name-column.case";
import orphanLinkFieldDeleteCase from "./cases/link/y233-delete-a-link-whose-table-is-gone.case";
import linkOneoneDeleteKeepsTableReadableCase from "./cases/link/y162-oneone-delete-keeps-table-readable.case";
import tableTrashDegradesInboundLinkCase from "./cases/table/y163-trash-degrades-inbound-link.case";
import duplicateSelectChoiceCase from "./cases/table/y330-a-table-with-a-repeated-choice.case";
import restoreInboundLinkCase from "./cases/table/y324-restore-brings-back-the-links-to-it.case";
import tableUsableAfterFailedUpdateCase from "./cases/table/y323-usable-after-a-refused-column-change.case";
import deleteErrorStateTableCase from "./cases/table/y242-delete-a-table-whose-creation-failed.case";
import linkRequiredLinkBlocksOwnerDeleteCase from "./cases/link/y174-required-link-blocks-owner-delete.case";
import recordLegacyUniqueViolationNamesFieldCase from "./cases/record/y175-legacy-unique-violation-names-field.case";
import userFieldPasteNonCollaboratorValueCase from "./cases/user-field/y176-paste-non-collaborator-value.case";
import userFieldNotifyOnAssignCase from "./cases/user-field/y327-assigning-someone-tells-them.case";
import userWriteScopeCase from "./cases/user-field/y232-write-stays-inside-the-base.case";
import userFieldGroupFoldsDriftedSnapshotsCase from "./cases/user-field/y196-group-folds-drifted-snapshots.case";
import userFieldGroupKeepsLegacyIdOutOfEmptyCase from "./cases/user-field/y197-group-keeps-legacy-id-out-of-empty.case";
import userFieldGroupKeepsUnwrappedCellOutOfEmptyCase from "./cases/user-field/y198-group-keeps-unwrapped-cell-out-of-empty.case";
import lookupStaleTextMetadataRecastsOnRebuildCase from "./cases/lookup/y177-stale-text-metadata-recasts-on-rebuild.case";
import lookupStaleTextMetadataSurvivesDisplayConvertCase from "./cases/lookup/y178-stale-text-metadata-survives-display-convert.case";
import lookupNullMultiplicityScalarRefreshesCase from "./cases/lookup/y179-null-multiplicity-scalar-refreshes.case";
import lookupNullMultiplicityScalarConvertsCase from "./cases/lookup/y180-null-multiplicity-scalar-converts.case";
import importExcelDuplicateHeadersCase from "./cases/import/y181-excel-duplicate-headers.case";
import appendImportComputedCase from "./cases/import/y317-appended-rows-get-their-computed-values.case";
import auditFieldsLastModifiedByResolvesNameCase from "./cases/audit-fields/y182-last-modified-by-resolves-name.case";
import realtimeViewFilterUpdateReachesSubscribersCase from "./cases/realtime/y183-view-filter-update-reaches-subscribers.case";
import duplicateFieldRealtimeCase from "./cases/realtime/y328-a-duplicated-column-reaches-the-open-page.case";
import lookupConfigRealtimeCase from "./cases/realtime/y320-lookup-config-change-reaches-the-page.case";
import selectOptionRemovalRealtimeCase from "./cases/realtime/y247-retiring-a-choice-reaches-the-open-page.case";
import realtimeViewGroupAndSortReachSubscribersCase from "./cases/realtime/y184-view-group-and-sort-reach-subscribers.case";
import undoDeleteRecordsUndoRestoresAllCase from "./cases/undo/y185-delete-records-undo-restores-all.case";
import linkCrossBaseLinkClearsOnDeleteCase from "./cases/link/y186-cross-base-link-clears-on-delete.case";
import importExcelHeaderBelowA1Case from "./cases/import/y187-excel-header-below-a1.case";
import selectionPasteByIdLandsOnItsOwnRowsCase from "./cases/selection/y188-paste-by-id-lands-on-its-own-rows.case";
import groupedRangeOffsetCase from "./cases/selection/y322-paste-in-a-grouped-view.case";
import tiedSortOffsetCase from "./cases/selection/y318-paste-lands-on-the-row-you-see.case";
import searchStaysInsideViewFilterCase from "./cases/search/y189-stays-inside-view-filter.case";
import searchEveryFieldCase from "./cases/search/y335-stays-inside-view-filter-when-searching-every-field.case";
import fieldUniqueToggleCase from "./cases/field/y228-turning-off-no-duplicates-lets-a-duplicate-in.case";
import timezoneAliasCase from "./cases/field/y326-a-date-column-in-an-aliased-timezone.case";
import oversizedSelectChoiceCase from "./cases/field/y325-a-value-too-long-to-be-a-choice.case";
import clearNumberDefaultCase from "./cases/field/y238-clear-a-number-default.case";
import clearDateDefaultCase from "./cases/field/y239-clear-a-date-default.case";
import clearSelectDefaultCase from "./cases/field/y240-clear-a-select-default.case";
import buttonDisplayChangeCase from "./cases/field/y235-button-rename-keeps-click-counts.case";
import textToDateConversionCase from "./cases/field/y234-convert-text-with-impossible-dates.case";
import importHeaderlessSheetCase from "./cases/import/y226-headerless-sheet-imports-every-line.case";
import linkRenameKeepsConfigCase from "./cases/link/y227-renaming-a-link-keeps-what-it-points-at.case";
import aggregationMixedCaseCase from "./cases/aggregation/y224-capitalised-column-can-be-totalled.case";
import fieldCheckboxClearedDefaultCase from "./cases/field/y225-clearing-a-checkbox-default-saves.case";
import filterPlainDateStringCase from "./cases/filter/y222-plain-date-string-filters-a-date-column.case";
import formulaOverDateLookupCase from "./cases/formula/y223-formula-over-a-looked-up-date-follows-a-change.case";
import fieldRequiredDefaultBackfillCase from "./cases/field/y221-required-default-backfills-existing-rows.case";
import lookupRollupFilterCase from "./cases/lookup/y219-rollup-condition-is-saved-and-applied.case";
import lookupRetargetCase from "./cases/lookup/y220-repointed-lookup-shows-its-new-target.case";
import tableRestoreScopeCase from "./cases/table/y218-restore-brings-back-only-its-own-delete.case";
import fieldLegacyIdTableCase from "./cases/field/y216-legacy-field-id-table-still-works.case";
import lookupNestedRenameCase from "./cases/lookup/y217-renaming-a-nested-lookup-keeps-its-choices.case";
import realtimeManualSortCase from "./cases/realtime/y214-manual-sort-reaches-the-open-page.case";
import multiFieldUpdateRealtimeCase from "./cases/realtime/y229-multi-field-update-reaches-the-open-page.case";
import fieldRatingConversionCase from "./cases/field/y213-rating-conversion-normalizes-existing-values.case";
import linkTwoToOneTableCase from "./cases/link/y215-two-links-to-one-table-get-two-columns.case";
import lookupConditionalForeignRefCase from "./cases/lookup/y207-conditional-filter-over-a-foreign-table.case";
import recordInvalidDateCase from "./cases/record/y208-invalid-date-is-not-invented.case";
import recordRatingDomainCase from "./cases/record/y209-rating-is-stored-in-whole-stars.case";
import linkSingleArrayCase from "./cases/link/y210-single-link-accepts-a-one-entry-array.case";
import linkMultiObjectCase from "./cases/link/y211-multi-link-accepts-a-bare-object.case";
import linkNullTitleCase from "./cases/link/y212-link-to-a-row-without-a-name-rewrites.case";
import recordLegacyIdStillComputesCase from "./cases/record/y204-legacy-id-row-still-computes.case";
import lookupConditionalRestoreCase from "./cases/lookup/y205-conditional-lookup-survives-restore.case";
import viewAddedFieldLandsLastCase from "./cases/view/y206-added-field-lands-after-legacy-columns.case";
import fieldDeleteSparesSharedColumnCase from "./cases/field/y201-delete-spares-a-field-sharing-its-column.case";
import recordRepeatedDeleteIsIdempotentCase from "./cases/record/y202-repeated-delete-is-idempotent.case";
import tableDuplicateWithSharedViewCase from "./cases/table/y203-duplicate-with-shared-view.case";
import selectionPasteAcrossPendingFieldCase from "./cases/selection/y199-paste-across-pending-field.case";
import selectionPasteByIdAcrossPendingFieldCase from "./cases/selection/y200-paste-by-id-across-pending-field.case";
import tableTrashDegradesInboundLinkWithoutDisplayColumnCase from "./cases/table/y190-trash-degrades-inbound-link-without-display-column.case";
import userFieldImportDoesNotNotifyAssigneeCase from "./cases/user-field/y191-import-does-not-notify-assignee.case";
import userFieldTableDuplicateDoesNotNotifyAssigneeCase from "./cases/user-field/y192-table-duplicate-does-not-notify-assignee.case";
import recordDuplicateNotifyCase from "./cases/user-field/y573-record-duplicate-does-not-notify-assignee.case";
import userFieldUndoOfDeleteDoesNotRenotifyAssigneeCase from "./cases/user-field/y193-undo-of-delete-does-not-renotify-assignee.case";
import userFieldUndoOfClearDoesNotRenotifyAssigneeCase from "./cases/user-field/y194-undo-of-clear-does-not-renotify-assignee.case";
import userFieldAssignmentBurstArrivesCoalescedCase from "./cases/user-field/y195-assignment-burst-arrives-coalesced.case";
import circularAppendBurstReachesEveryLookupCase from "./cases/lookup/y555-a-burst-of-new-rows-reaches-every-lookup.case";
import searchY164MultiFieldSearchKeepsViewFilterCase from "./cases/search/y164-multi-field-search-keeps-view-filter.case";
import authorityY404CommentsStayInsideAuthorizedRecordsCase from "./cases/authority/y404-comments-stay-inside-authorized-records.case";
import authorityY402ArchiveAuthorizedGroupedRecordCase from "./cases/authority/y402-archive-authorized-grouped-record.case";
import authorityY166Y168RestrictedSavedViewStaysUsableCase from "./cases/authority/y166-y168-restricted-saved-view-stays-usable.case";
import viewY278GroupToolsStayChineseCase from "./cases/view/y278-group-tools-stay-chinese.case";
import commentY559DeletingACommentUpdatesTheOpenPanelCase from "./cases/comment/y559-deleting-a-comment-updates-the-open-panel.case";
import authorityY386RestrictedGroupedGridStaysReadableCase from "./cases/authority/y386-restricted-grouped-grid-stays-readable.case";
import lookupY470OrdinaryRollupRejectsIncompatibleAggregationCase from "./cases/lookup/y470-ordinary-rollup-rejects-incompatible-aggregation.case";
import lookupY471Y472Y478Y492ConditionalRollupKeepsNestedOrCase from "./cases/lookup/y471-y472-y478-y492-conditional-rollup-keeps-nested-or.case";
import lookupY486ConditionalRollupRejectsIncompatibleAggregationCase from "./cases/lookup/y486-conditional-rollup-rejects-incompatible-aggregation.case";
import lookupY465OrdinaryRollupKeepsLinkedRecordIdentityCase from "./cases/lookup/y465-ordinary-rollup-keeps-linked-record-identity.case";
import lookupY479Y482ConditionalRollupEditorKeepsNestedOrCase from "./cases/lookup/y479-y482-conditional-rollup-editor-keeps-nested-or.case";
import lookupY483ConditionalRollupEditorWrapsLookupConditionsCase from "./cases/lookup/y483-conditional-rollup-editor-wraps-lookup-conditions.case";
import linkY554PickerKeepsSelectionAcrossTabsCase from "./cases/link/y554-picker-keeps-selection-across-tabs.case";
import type { BugCase } from "./framework/types";

// Every runnable case, registered explicitly. scripts/case-catalog.mjs parses
// this file statically (imports + the array below), so the planner and the
// checks can enumerate cases without resolving @teable/* packages.
const cases = [
  lookupY483ConditionalRollupEditorWrapsLookupConditionsCase,
  lookupY479Y482ConditionalRollupEditorKeepsNestedOrCase,
  lookupY465OrdinaryRollupKeepsLinkedRecordIdentityCase,
  linkY554PickerKeepsSelectionAcrossTabsCase,
  lookupY470OrdinaryRollupRejectsIncompatibleAggregationCase,
  lookupY471Y472Y478Y492ConditionalRollupKeepsNestedOrCase,
  lookupY486ConditionalRollupRejectsIncompatibleAggregationCase,
  commentY559DeletingACommentUpdatesTheOpenPanelCase,
  authorityY404CommentsStayInsideAuthorizedRecordsCase,
  authorityY402ArchiveAuthorizedGroupedRecordCase,
  authorityY386RestrictedGroupedGridStaysReadableCase,
  viewY278GroupToolsStayChineseCase,
  authorityY166Y168RestrictedSavedViewStaysUsableCase,
  searchY164MultiFieldSearchKeepsViewFilterCase,
  smokeAuthUserCase,
  recordBulkUpdate100MixedLandsCase,
  lookupOfRollupCreateCase,
  aiConfigOnlyChangePlanCase,
  emptyWriteNormalizationCase,
  tableDeleteCollaboratorRecoveryCase,
  archiveRecountCase,
  projectedGroupHeadersCase,
  lookupMultiplicityVoCase,
  linkPickerShareLookupCase,
  manyoneTypecastShapeCase,
  rowCountSearchProjectionCase,
  shareCopyOutsidePanelCase,
  lookupSelectChoicesKeptCase,
  booleanFormulaFilterCase,
  duplicateBaseRecentListCase,
  fieldOptionPreservationCase,
  departmentShareUserPickerCase,
  staleViewColumnMetaCase,
  nestedFilterConjunctionCase,
  conditionalRollupUserMatchCase,
  weekdayStartDayCase,
  fromnowUnitCase,
  formulaOverSystemColumnsCase,
  trackedModifiedSortCase,
  lookupOfLinkContainsCase,
  deleteWithoutUndoCaptureCase,
  singleFieldPendingStateCase,
  sparseBatchUpdateCase,
  generatedFormulaColumnCase,
  legacyGeneratedAuditColumnCase,
  recordCollapsedDateGroupStaysHiddenCase,
  baseShareSaveIntoExistingBaseTwiceCase,
  baseImportFieldDescriptionCase,
  baseImportNoTablesCase,
  viewIncompleteFilterConditionSurvivesCase,
  meFilterInViewCase,
  formRequiredComputedCase,
  filterScalarLookupNoneOfLoadsCase,
  isWithinTodayFilterCase,
  lookupUserSnapshotDateSortSpansGroupCase,
  rollupMetadataRenameCase,
  formulaScalarValueOverLinkedTextCase,
  datetimeDiffDefaultUnitCase,
  userMultiplicityFormulaCase,
  formulaErrorRepairCase,
  linkRequiredLinkKeepsSiblingRefreshCase,
  incomingLinkCleanupCase,
  linkPasteFormulaTitleCase,
  linkPickerPrimaryFieldCase,
  orphanLinkFieldDeleteCase,
  linkOneoneDeleteKeepsTableReadableCase,
  tableTrashDegradesInboundLinkCase,
  duplicateSelectChoiceCase,
  restoreInboundLinkCase,
  tableUsableAfterFailedUpdateCase,
  deleteErrorStateTableCase,
  linkRequiredLinkBlocksOwnerDeleteCase,
  recordLegacyUniqueViolationNamesFieldCase,
  userFieldPasteNonCollaboratorValueCase,
  userFieldNotifyOnAssignCase,
  userWriteScopeCase,
  lookupStaleTextMetadataRecastsOnRebuildCase,
  lookupStaleTextMetadataSurvivesDisplayConvertCase,
  lookupNullMultiplicityScalarRefreshesCase,
  lookupNullMultiplicityScalarConvertsCase,
  importExcelDuplicateHeadersCase,
  appendImportComputedCase,
  auditFieldsLastModifiedByResolvesNameCase,
  realtimeViewFilterUpdateReachesSubscribersCase,
  duplicateFieldRealtimeCase,
  lookupConfigRealtimeCase,
  selectOptionRemovalRealtimeCase,
  realtimeViewGroupAndSortReachSubscribersCase,
  undoDeleteRecordsUndoRestoresAllCase,
  linkCrossBaseLinkClearsOnDeleteCase,
  importExcelHeaderBelowA1Case,
  selectionPasteByIdLandsOnItsOwnRowsCase,
  groupedRangeOffsetCase,
  tiedSortOffsetCase,
  searchStaysInsideViewFilterCase,
  searchEveryFieldCase,
  fieldUniqueToggleCase,
  timezoneAliasCase,
  oversizedSelectChoiceCase,
  clearNumberDefaultCase,
  clearDateDefaultCase,
  clearSelectDefaultCase,
  buttonDisplayChangeCase,
  textToDateConversionCase,
  importHeaderlessSheetCase,
  linkRenameKeepsConfigCase,
  aggregationMixedCaseCase,
  fieldCheckboxClearedDefaultCase,
  filterPlainDateStringCase,
  formulaOverDateLookupCase,
  fieldRequiredDefaultBackfillCase,
  lookupRollupFilterCase,
  lookupRetargetCase,
  tableRestoreScopeCase,
  fieldLegacyIdTableCase,
  lookupNestedRenameCase,
  realtimeManualSortCase,
  multiFieldUpdateRealtimeCase,
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
  recordDuplicateNotifyCase,
  userFieldUndoOfDeleteDoesNotRenotifyAssigneeCase,
  userFieldUndoOfClearDoesNotRenotifyAssigneeCase,
  userFieldAssignmentBurstArrivesCoalescedCase,
  circularAppendBurstReachesEveryLookupCase,
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
