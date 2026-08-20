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
import tableTrashDegradesInboundLinkWithoutDisplayColumnCase from "./cases/table/trash-degrades-inbound-link-without-display-column.case";
import computedNumberColumnConvertedToFormulaLookupCase from "./cases/computed/number-column-converted-to-formula-lookup.case";
import computedFormulaOverTextStoredLinkLookupCase from "./cases/computed/formula-over-text-stored-link-lookup.case";
import computedLinkLookupAddedAfterRowsAreLinkedCase from "./cases/computed/link-lookup-added-after-rows-are-linked.case";
import computedLookupRepointedAtAnotherFieldCase from "./cases/computed/lookup-repointed-at-another-field.case";
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
  tableTrashDegradesInboundLinkWithoutDisplayColumnCase,
  computedNumberColumnConvertedToFormulaLookupCase,
  computedFormulaOverTextStoredLinkLookupCase,
  computedLinkLookupAddedAfterRowsAreLinkedCase,
  computedLookupRepointedAtAnotherFieldCase,
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
