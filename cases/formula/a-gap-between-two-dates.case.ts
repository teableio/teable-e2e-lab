import { defineBugCase } from "../../framework/types";

// T2328: writing the gap between two dates without naming a unit is the short
// form everyone writes first, and the formula language it is copied from
// answers in seconds. Answering in days is not a rounding difference - it is
// the same number divided by 86,400, so two days reads as 2 where 172,800 was
// meant. Nothing marks it: a column of small numbers looks like a column of
// small numbers, and whatever it feeds is wrong by a factor nobody would guess
// from the values.
export default defineBugCase({
  id: "formula/a-gap-between-two-dates",
  title: "A gap between two dates comes back in the promised unit",
  runner: "datetime-diff-default-unit",
  timeoutMs: 180_000,
  bug: {
    issue: "T2328",
    status: "fixed",
    sourceCommits: ["6385d478b"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-datetime-diff",
    rowTitle: "the-job",
    // Two whole days apart: 172,800 seconds, or 2 if the unit is wrong.
    started: "2026-03-01T00:00:00.000Z",
    finished: "2026-03-03T00:00:00.000Z",
    timeZone: "UTC",
  },
});
