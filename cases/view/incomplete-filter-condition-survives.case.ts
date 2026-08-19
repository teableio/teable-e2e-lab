import { defineBugCase } from "../../framework/types";

// T6568: picking a field in the filter panel made the new condition disappear
// again. A condition whose value is still empty - what the panel writes the
// instant a field is chosen - was dropped on the way through the view filter
// schema, so the saved filter came back one condition short.
export default defineBugCase({
  id: "view/incomplete-filter-condition-survives",
  title: "筛选条件只选了字段还没填值，保存后仍然在，且不影响取数",
  runner: "view-filter-roundtrip",
  timeoutMs: 120_000,
  bug: {
    issue: "T6568",
    status: "fixed",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-view-incomplete-filter",
    choices: ["Partner", "Direct"],
    rowTitles: ["kept", "dropped-a", "dropped-b"],
    matchedTitle: "kept",
  },
});
