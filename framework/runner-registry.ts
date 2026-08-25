import { runAuditUserNameResolvesCase } from "./runners/audit-user-name-resolves.runner";
import { runComputedValueLandsCase } from "./runners/computed-value-lands.runner";
import { runDeleteUndoRestoresCase } from "./runners/delete-undo-restores.runner";
import { runCrossBaseLinkDeleteCase } from "./runners/cross-base-link-delete.runner";
import { runExcelImportDuplicateColumnsCase } from "./runners/excel-import-duplicate-columns.runner";
import { runExcelImportOffsetHeaderCase } from "./runners/excel-import-offset-header.runner";
import { runGroupCollapseCase } from "./runners/group-collapse.runner";
import { runLinkDeleteReadableCase } from "./runners/link-delete-readable.runner";
import { runLegacyUniqueErrorCase } from "./runners/legacy-unique-error.runner";
import { runLookupFilterViewCase } from "./runners/lookup-filter-view.runner";
import { runLookupUserSnapshotSortCase } from "./runners/lookup-user-snapshot-sort.runner";
import { runUserGroupIdentityCase } from "./runners/user-group-identity.runner";
import { runHttpCheckCase } from "./runners/http-check.runner";
import { runNullMultiplicityLookupCase } from "./runners/null-multiplicity-lookup.runner";
import { runPasteByIdAlignmentCase } from "./runners/paste-by-id-alignment.runner";
import { runPasteNonCollaboratorUserCase } from "./runners/paste-non-collaborator-user.runner";
import { runRecordFlowCase } from "./runners/record-flow.runner";
import { runRequiredLinkBlocksDeleteCase } from "./runners/required-link-blocks-delete.runner";
import { runRequiredLinkRefreshCase } from "./runners/required-link-refresh.runner";
import { runStaleLookupRecastCase } from "./runners/stale-lookup-recast.runner";
import { runSearchViewFilterCase } from "./runners/search-view-filter.runner";
import { runDeleteCollateralCase } from "./runners/delete-collateral.runner";
import { runPasteOverPendingFieldCase } from "./runners/paste-over-pending-field.runner";
import { runDuplicateSharedViewCase } from "./runners/duplicate-shared-view.runner";
import { runLegacyRecordIdCase } from "./runners/legacy-record-id.runner";
import { runShareSaveCase } from "./runners/share-save.runner";
import { runTableTrashInboundLinkCase } from "./runners/table-trash-inbound-link.runner";
import { runUserFieldNotifyBulkActionCase } from "./runners/user-field-notify-bulk-action.runner";
import { runUserFieldNotifyBurstCase } from "./runners/user-field-notify-burst.runner";
import { runUserFieldNotifyReplayCase } from "./runners/user-field-notify-replay.runner";
import { runViewFilterRealtimeCase } from "./runners/view-filter-realtime.runner";
import { runViewPropertyRealtimeCase } from "./runners/view-property-realtime.runner";
import { runViewFilterRoundtripCase } from "./runners/view-filter-roundtrip.runner";
import { runRestoreConditionalLookupCase } from "./runners/restore-conditional-lookup.runner";
import { runSparseViewFieldOrderCase } from "./runners/sparse-view-field-order.runner";
import { runConditionalFilterFieldRefsCase } from "./runners/conditional-filter-field-refs.runner";
import { runValueNormalizationCase } from "./runners/value-normalization.runner";
import { runLinkCellShapeCase } from "./runners/link-cell-shape.runner";
import { runRatingConversionCase } from "./runners/rating-conversion.runner";
import { runManualSortRealtimeCase } from "./runners/manual-sort-realtime.runner";
import { runRepeatedForeignLinksCase } from "./runners/repeated-foreign-links.runner";
import { runLegacyFieldIdCase } from "./runners/legacy-field-id.runner";
import { runNestedLookupRenameCase } from "./runners/nested-lookup-rename.runner";
import { runTableRestoreScopeCase } from "./runners/table-restore-scope.runner";
import { runRollupFilterPersistsCase } from "./runners/rollup-filter-persists.runner";
import { runLookupRetargetCase } from "./runners/lookup-retarget.runner";
import { runRequiredDefaultCase } from "./runners/required-default.runner";
import { runLegacyDateFilterCase } from "./runners/legacy-date-filter.runner";
import { runFormulaOverDateLookupCase } from "./runners/formula-over-date-lookup.runner";
import { runAggregationMixedCaseCase } from "./runners/aggregation-mixed-case.runner";
import { runCheckboxClearedDefaultCase } from "./runners/checkbox-cleared-default.runner";
import { runCsvHeadersDisabledCase } from "./runners/csv-headers-disabled.runner";
import { runLinkRenameKeepsConfigCase } from "./runners/link-rename-keeps-config.runner";
import { runUniqueToggleCleanupCase } from "./runners/unique-toggle-cleanup.runner";
import { runMultiFieldUpdateRealtimeCase } from "./runners/multi-field-update-realtime.runner";
import { runBaseImportFieldDescriptionCase } from "./runners/base-import-field-description.runner";
import { runUserWriteScopeCase } from "./runners/user-write-scope.runner";
import { runOrphanLinkFieldDeleteCase } from "./runners/orphan-link-field-delete.runner";
import { runTextToDateConversionCase } from "./runners/text-to-date-conversion.runner";
import { runButtonDisplayChangeCase } from "./runners/button-display-change.runner";
import { runLinkPickerPrimaryFieldCase } from "./runners/link-picker-primary-field.runner";
import { runRollupMetadataRenameCase } from "./runners/rollup-metadata-rename.runner";
import { runClearedDefaultCase } from "./runners/cleared-default.runner";
import { runLegacyGeneratedAuditColumnCase } from "./runners/legacy-generated-audit-column.runner";
import { runDeleteErrorStateTableCase } from "./runners/delete-error-state-table.runner";
import { runLinkPasteFormulaTitleCase } from "./runners/link-paste-formula-title.runner";
import { runGeneratedFormulaColumnCase } from "./runners/generated-formula-column.runner";
import { runIncomingLinkCleanupCase } from "./runners/incoming-link-cleanup.runner";
import { runFormulaErrorRepairCase } from "./runners/formula-error-repair.runner";
import { runSelectOptionRemovalRealtimeCase } from "./runners/select-option-removal-realtime.runner";
import { runAppendImportComputedCase } from "./runners/append-import-computed.runner";
import { runTiedSortOffsetCase } from "./runners/tied-sort-offset.runner";
import { runFormRequiredComputedCase } from "./runners/form-required-computed.runner";
import { runLookupConfigRealtimeCase } from "./runners/lookup-config-realtime.runner";
import { runUserMultiplicityFormulaCase } from "./runners/user-multiplicity-formula.runner";
import { runGroupedRangeOffsetCase } from "./runners/grouped-range-offset.runner";
import { runTableUsableAfterFailedUpdateCase } from "./runners/table-usable-after-failed-update.runner";
import { runRestoreInboundLinkCase } from "./runners/restore-inbound-link.runner";
import { runOversizedSelectChoiceCase } from "./runners/oversized-select-choice.runner";
import { runTimezoneAliasCase } from "./runners/timezone-alias.runner";
import { runDuplicateFieldRealtimeCase } from "./runners/duplicate-field-realtime.runner";
import { runUserFieldNotifyOnAssignCase } from "./runners/user-field-notify-on-assign.runner";
import { runMeFilterInViewCase } from "./runners/me-filter-in-view.runner";
import { runDuplicateSelectChoiceCase } from "./runners/duplicate-select-choice.runner";
import { runDatetimeDiffDefaultUnitCase } from "./runners/datetime-diff-default-unit.runner";
import { runIsWithinTodayFilterCase } from "./runners/is-within-today-filter.runner";
import { runSparseBatchUpdateCase } from "./runners/sparse-batch-update.runner";
import { runAiConfigOnlyChangePlanCase } from "./runners/ai-config-only-change-plan.runner";
import { runEmptyWriteNormalizationCase } from "./runners/empty-write-normalization.runner";
import { runArchiveRecountCase } from "./runners/archive-recount.runner";
import { runLinkPickerShareLookupCase } from "./runners/link-picker-share-lookup.runner";
import { runManyoneTypecastShapeCase } from "./runners/manyone-typecast-shape.runner";
import { runRowCountSearchProjectionCase } from "./runners/row-count-search-projection.runner";
import { runLookupSelectChoicesKeptCase } from "./runners/lookup-select-choices-kept.runner";
import { runShareCopyOutsidePanelCase } from "./runners/share-copy-outside-panel.runner";
import { runLookupMultiplicityVoCase } from "./runners/lookup-multiplicity-vo.runner";
import { runProjectedGroupHeadersCase } from "./runners/projected-group-headers.runner";
import { runTableDeleteRealtimeCase } from "./runners/table-delete-realtime.runner";
import { runTrackedModifiedSortCase } from "./runners/tracked-modified-sort.runner";
import { runLookupOfLinkContainsCase } from "./runners/lookup-of-link-contains.runner";
import { runDeleteWithoutUndoCaptureCase } from "./runners/delete-without-undo-capture.runner";
import { runSingleFieldPendingStateCase } from "./runners/single-field-pending-state.runner";
import { runLookupOfRollupCreateCase } from "./runners/lookup-of-rollup-create.runner";
import type {
  BugCase,
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  BugRunnerKind,
} from "./types";

type RunnerFn<K extends BugRunnerKind> = (
  bugCase: BugCaseFor<K>,
  context: BugRunContext,
) => Promise<BugProbeResult>;

// The dispatch seam. Adding a runner is three edits that the type system keeps
// honest: the config interface in types.ts, the entry in BugCaseConfigByRunner,
// and the implementation here — miss one and `pnpm check:types` fails.
const runners: { [K in BugRunnerKind]: RunnerFn<K> } = {
  "http-check": runHttpCheckCase,
  "record-flow": runRecordFlowCase,
  "group-collapse": runGroupCollapseCase,
  "share-save": runShareSaveCase,
  "view-filter-roundtrip": runViewFilterRoundtripCase,
  "lookup-filter-view": runLookupFilterViewCase,
  "lookup-user-snapshot-sort": runLookupUserSnapshotSortCase,
  "user-group-identity": runUserGroupIdentityCase,
  "computed-value-lands": runComputedValueLandsCase,
  "required-link-refresh": runRequiredLinkRefreshCase,
  "link-delete-readable": runLinkDeleteReadableCase,
  "table-trash-inbound-link": runTableTrashInboundLinkCase,
  "required-link-blocks-delete": runRequiredLinkBlocksDeleteCase,
  "legacy-unique-error": runLegacyUniqueErrorCase,
  "paste-non-collaborator-user": runPasteNonCollaboratorUserCase,
  "stale-lookup-recast": runStaleLookupRecastCase,
  "null-multiplicity-lookup": runNullMultiplicityLookupCase,
  "excel-import-duplicate-columns": runExcelImportDuplicateColumnsCase,
  "audit-user-name-resolves": runAuditUserNameResolvesCase,
  "view-filter-realtime": runViewFilterRealtimeCase,
  "view-property-realtime": runViewPropertyRealtimeCase,
  "delete-undo-restores": runDeleteUndoRestoresCase,
  "cross-base-link-delete": runCrossBaseLinkDeleteCase,
  "excel-import-offset-header": runExcelImportOffsetHeaderCase,
  "paste-by-id-alignment": runPasteByIdAlignmentCase,
  "search-view-filter": runSearchViewFilterCase,
  "delete-collateral": runDeleteCollateralCase,
  "user-field-notify-bulk-action": runUserFieldNotifyBulkActionCase,
  "user-field-notify-replay": runUserFieldNotifyReplayCase,
  "user-field-notify-burst": runUserFieldNotifyBurstCase,
  "paste-over-pending-field": runPasteOverPendingFieldCase,
  "duplicate-shared-view": runDuplicateSharedViewCase,
  "legacy-record-id": runLegacyRecordIdCase,
  "restore-conditional-lookup": runRestoreConditionalLookupCase,
  "sparse-view-field-order": runSparseViewFieldOrderCase,
  "conditional-filter-field-refs": runConditionalFilterFieldRefsCase,
  "value-normalization": runValueNormalizationCase,
  "link-cell-shape": runLinkCellShapeCase,
  "rating-conversion": runRatingConversionCase,
  "manual-sort-realtime": runManualSortRealtimeCase,
  "repeated-foreign-links": runRepeatedForeignLinksCase,
  "legacy-field-id": runLegacyFieldIdCase,
  "nested-lookup-rename": runNestedLookupRenameCase,
  "table-restore-scope": runTableRestoreScopeCase,
  "rollup-filter-persists": runRollupFilterPersistsCase,
  "lookup-retarget": runLookupRetargetCase,
  "required-default": runRequiredDefaultCase,
  "legacy-date-filter": runLegacyDateFilterCase,
  "formula-over-date-lookup": runFormulaOverDateLookupCase,
  "aggregation-mixed-case": runAggregationMixedCaseCase,
  "checkbox-cleared-default": runCheckboxClearedDefaultCase,
  "csv-headers-disabled": runCsvHeadersDisabledCase,
  "link-rename-keeps-config": runLinkRenameKeepsConfigCase,
  "unique-toggle-cleanup": runUniqueToggleCleanupCase,
  "multi-field-update-realtime": runMultiFieldUpdateRealtimeCase,
  "base-import-field-description": runBaseImportFieldDescriptionCase,
  "user-write-scope": runUserWriteScopeCase,
  "orphan-link-field-delete": runOrphanLinkFieldDeleteCase,
  "text-to-date-conversion": runTextToDateConversionCase,
  "button-display-change": runButtonDisplayChangeCase,
  "link-picker-primary-field": runLinkPickerPrimaryFieldCase,
  "rollup-metadata-rename": runRollupMetadataRenameCase,
  "cleared-default": runClearedDefaultCase,
  "legacy-generated-audit-column": runLegacyGeneratedAuditColumnCase,
  "delete-error-state-table": runDeleteErrorStateTableCase,
  "link-paste-formula-title": runLinkPasteFormulaTitleCase,
  "generated-formula-column": runGeneratedFormulaColumnCase,
  "incoming-link-cleanup": runIncomingLinkCleanupCase,
  "formula-error-repair": runFormulaErrorRepairCase,
  "select-option-removal-realtime": runSelectOptionRemovalRealtimeCase,
  "append-import-computed": runAppendImportComputedCase,
  "tied-sort-offset": runTiedSortOffsetCase,
  "form-required-computed": runFormRequiredComputedCase,
  "lookup-config-realtime": runLookupConfigRealtimeCase,
  "user-multiplicity-formula": runUserMultiplicityFormulaCase,
  "grouped-range-offset": runGroupedRangeOffsetCase,
  "table-usable-after-failed-update": runTableUsableAfterFailedUpdateCase,
  "restore-inbound-link": runRestoreInboundLinkCase,
  "oversized-select-choice": runOversizedSelectChoiceCase,
  "timezone-alias": runTimezoneAliasCase,
  "duplicate-field-realtime": runDuplicateFieldRealtimeCase,
  "user-field-notify-on-assign": runUserFieldNotifyOnAssignCase,
  "me-filter-in-view": runMeFilterInViewCase,
  "duplicate-select-choice": runDuplicateSelectChoiceCase,
  "datetime-diff-default-unit": runDatetimeDiffDefaultUnitCase,
  "is-within-today-filter": runIsWithinTodayFilterCase,
  "sparse-batch-update": runSparseBatchUpdateCase,
  "lookup-of-rollup-create": runLookupOfRollupCreateCase,
  "ai-config-only-change-plan": runAiConfigOnlyChangePlanCase,
  "empty-write-normalization": runEmptyWriteNormalizationCase,
  "table-delete-realtime": runTableDeleteRealtimeCase,
  "archive-recount": runArchiveRecountCase,
  "projected-group-headers": runProjectedGroupHeadersCase,
  "lookup-multiplicity-vo": runLookupMultiplicityVoCase,
  "link-picker-share-lookup": runLinkPickerShareLookupCase,
  "manyone-typecast-shape": runManyoneTypecastShapeCase,
  "row-count-search-projection": runRowCountSearchProjectionCase,
  "share-copy-outside-panel": runShareCopyOutsidePanelCase,
  "lookup-select-choices-kept": runLookupSelectChoicesKeptCase,
  "tracked-modified-sort": runTrackedModifiedSortCase,
  "lookup-of-link-contains": runLookupOfLinkContainsCase,
  "delete-without-undo-capture": runDeleteWithoutUndoCaptureCase,
  "single-field-pending-state": runSingleFieldPendingStateCase,
};

export const executeRegisteredRunner = (
  bugCase: BugCase,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const runner = runners[bugCase.runner] as RunnerFn<BugRunnerKind>;
  if (!runner) {
    throw new Error(`No runner registered for kind "${bugCase.runner}"`);
  }
  return runner(bugCase as never, context);
};
