import { defineBugCase } from "../../framework/types";

// T1745: "how much work is on my team" is what a column like this answers -
// the project row lists who is on it, each task has one owner, and the total
// is over the tasks owned by anyone on the list. One person on a task and
// several on a project are the same kind of thing written two ways, and asking
// whether the one is among the several answered no every time. Zero is the
// worst possible wrong answer: it looks like an empty week rather than a
// broken column.
export default defineBugCase({
  id: "lookup/y565-hours-owned-by-anyone-on-this-row",
  title: "Hours owned by anyone on this row are totalled",
  runner: "conditional-rollup-user-match",
  timeoutMs: 240_000,
  bug: {
    issue: "T1745",
    status: "fixed",
    sourceCommits: ["de014d512"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-team-hours",
    staffedRowName: "the-staffed-project",
    emptyRowName: "the-unstaffed-project",
    ownedHours: [3, 4],
    unownedHours: [11],
    settleAttempts: 60,
    settleIntervalMs: 500,
  },
});
