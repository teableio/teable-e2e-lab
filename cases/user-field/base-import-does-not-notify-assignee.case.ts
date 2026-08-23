import { defineBugCase } from "../../framework/types";

// T6662, the third path the issue names and the largest one: importing a whole
// base. The import rebuilds every table in the file, so every user cell in
// every table arrives populated at once - a base with a few hundred assigned
// rows is a few hundred notifications and the matching pile of email, for
// assignments made long ago in the base the file came out of. Nobody assigned
// anyone anything; a copy of the base arrived.
export default defineBugCase({
  id: "user-field/base-import-does-not-notify-assignee",
  title: "Importing a base does not notify the people its user cells name",
  runner: "user-field-notify-base-import",
  timeoutMs: 300_000,
  bug: {
    issue: "T6662",
    status: "fixed",
    sourceCommits: ["01b1cd60d"],
  },
  config: {
    baseId: "seed-base",
    namePrefix: "e2e-lab-notify-base-import",
    rowTitle: "assigned-before-the-export",
    notifyTimeoutMs: 20_000,
    quietTimeoutMs: 25_000,
    rowVisibleTimeoutMs: 60_000,
    pollIntervalMs: 500,
  },
});
