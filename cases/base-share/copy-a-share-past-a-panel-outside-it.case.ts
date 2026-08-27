import { defineBugCase } from "../../framework/types";

// T3516: sharing one folder rather than the whole base is how a base is handed
// over in part - the customer gets the tables meant for them and nothing else.
// A dashboard panel on a table outside that folder broke the copy. The person
// receiving the share sees it fail with nothing to act on, and the person
// sharing has no reason to connect a dashboard on an unrelated table to a
// customer who cannot open their share.
export default defineBugCase({
  id: "base-share/copy-a-share-past-a-panel-outside-it",
  title: "A share copies past a dashboard panel outside it",
  runner: "share-copy-outside-panel",
  timeoutMs: 240_000,
  skipV1:
    "the case has the product create a second base mid-run, which is stamped v2 and cannot be unstamped before its tables are built - this method cannot ask v1, which is not the same as v1 lacking the feature",
  bug: {
    issue: "T3516",
    status: "fixed",
    sourceCommits: ["5bd907847"],
  },
  config: {
    baseNamePrefix: "e2e-lab-share-panel",
    folderName: "shared-folder",
    insideTableName: "shared-table",
    outsideTableName: "private-table",
    insidePanelName: "inside-panel",
    outsidePanelName: "outside-panel",
  },
});
