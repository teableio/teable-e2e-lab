import { runComputedValueLandsCase } from "./runners/computed-value-lands.runner";
import { runGroupCollapseCase } from "./runners/group-collapse.runner";
import { runLinkDeleteReadableCase } from "./runners/link-delete-readable.runner";
import { runLookupFilterViewCase } from "./runners/lookup-filter-view.runner";
import { runLookupUserSnapshotSortCase } from "./runners/lookup-user-snapshot-sort.runner";
import { runHttpCheckCase } from "./runners/http-check.runner";
import { runRecordFlowCase } from "./runners/record-flow.runner";
import { runRequiredLinkBlocksDeleteCase } from "./runners/required-link-blocks-delete.runner";
import { runRequiredLinkRefreshCase } from "./runners/required-link-refresh.runner";
import { runShareSaveCase } from "./runners/share-save.runner";
import { runTableTrashInboundLinkCase } from "./runners/table-trash-inbound-link.runner";
import { runViewFilterRoundtripCase } from "./runners/view-filter-roundtrip.runner";
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
  "computed-value-lands": runComputedValueLandsCase,
  "required-link-refresh": runRequiredLinkRefreshCase,
  "link-delete-readable": runLinkDeleteReadableCase,
  "table-trash-inbound-link": runTableTrashInboundLinkCase,
  "required-link-blocks-delete": runRequiredLinkBlocksDeleteCase,
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
