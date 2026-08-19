import { defineBugCase } from "../../framework/types";

// T6840: saving a shared folder into an existing base worked once and only
// once. The second save answered 500 (the v2 copy path inserted folders under
// their original names and hit the base_node (base_id, name) unique index),
// and even the first save left the target base looking untouched, because that
// path writes its rows with raw SQL and nobody flushed the node-list cache.
// Both halves are the same user story - "save into an existing base" - so they
// live in one checkpoint.
export default defineBugCase({
  id: "base-share/save-into-existing-base-twice",
  title: "同一个分享连续转存进同一个 Base 两次，都成功且都看得见",
  runner: "share-save",
  timeoutMs: 180_000,
  bug: {
    issue: "T6840",
    status: "fixed",
  },
  config: {
    spaceId: "seed-space",
    baseNamePrefix: "e2e-lab-share-save",
    folderName: "Shared Folder",
    // Two saves, matching the production report: the first is what must become
    // visible, the second is what used to 500.
    saveCount: 2,
    settleTimeoutMs: 15_000,
    settlePollIntervalMs: 250,
  },
});
