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
import { runFindOverMultiValueCase } from "./runners/find-over-multi-value.runner";
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
  "find-over-multi-value": runFindOverMultiValueCase,
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
