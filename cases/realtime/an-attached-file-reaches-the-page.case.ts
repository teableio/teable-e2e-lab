import { defineBugCase } from "../../framework/types";

// T3810: an attachment cell holds a file's name and its address, and the
// address is worked out per reader because it is temporary and signed.
// Whoever uploads gets it in the answer to their own upload; everyone else
// gets it from the message pushed to their page - and that message carried the
// file without one. So the row on everyone else's screen has an attachment
// that cannot be opened, downloaded or previewed: the name is there, the
// thumbnail is blank, and only a reload fixes it. "I uploaded it" and "there
// is nothing there" are both true at the same time.
export default defineBugCase({
  id: "realtime/an-attached-file-reaches-the-page",
  title: "An attached file reaches the open page with an address",
  runner: "attachment-realtime",
  timeoutMs: 180_000,
  bug: {
    issue: "T3810",
    status: "fixed",
    sourceCommits: ["b90f13537"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-attachment-rt",
    rowTitle: "the-row",
    fileName: "note.txt",
    fileContents: "attached by the e2e lab",
    subscribeTimeoutMs: 20_000,
    settleTimeoutMs: 20_000,
    pollIntervalMs: 250,
  },
});
