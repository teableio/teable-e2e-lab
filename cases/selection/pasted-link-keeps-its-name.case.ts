import { defineBugCase } from "../../framework/types";

// T6106: copying a link cell puts the linked record's id and its name on the
// clipboard. The paste kept the id and dropped the name, so what was pushed to
// everyone else watching the table was a cell with nothing to call itself -
// a column of "Untitled" until they reload. Whoever pasted sees it correctly,
// which is what makes it hard to believe when it is reported.
export default defineBugCase({
  id: "selection/pasted-link-keeps-its-name",
  title: "A pasted link cell arrives with the name of what it points at",
  runner: "paste-link-title",
  timeoutMs: 180_000,
  bug: {
    issue: "T6106",
    status: "fixed",
    sourceCommits: ["6421635ca"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-paste-link",
    foreignRowTitle: "Order 1042",
    sourceRowTitle: "row-with-the-link",
    targetRowTitle: "row-pasted-into",
    subscribeTimeoutMs: 20_000,
    settleTimeoutMs: 20_000,
    pollIntervalMs: 250,
  },
});
