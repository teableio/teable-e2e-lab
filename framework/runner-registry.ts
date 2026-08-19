import { runGroupCollapseCase } from "./runners/group-collapse.runner";
import { runLookupFilterViewCase } from "./runners/lookup-filter-view.runner";
import { runHttpCheckCase } from "./runners/http-check.runner";
import { runRecordFlowCase } from "./runners/record-flow.runner";
import { runShareSaveCase } from "./runners/share-save.runner";
import { runViewFilterRoundtripCase } from "./runners/view-filter-roundtrip.runner";
import type {
  BugCase,
  BugCaseFor,
  BugProbeResult,
  BugRunContext,
  BugRunnerKind,
} from "./types";
import { withForcedV2 } from "./v2-routing";

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
};

export const executeRegisteredRunner = (
  bugCase: BugCase,
  context: BugRunContext,
): Promise<BugProbeResult> => {
  const runner = runners[bugCase.runner] as RunnerFn<BugRunnerKind>;
  if (!runner) {
    throw new Error(`No runner registered for kind "${bugCase.runner}"`);
  }
  const run = () => runner(bugCase as never, context);
  return bugCase.routing === "force-v2" ? withForcedV2(run) : run();
};
