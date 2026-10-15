import { defineBugCase } from "../../framework/types";

// T7779: WORKDAY_DIFF left out one end of the range, so every span came out a
// day short, and adding one back would break reversed and weekend-only ranges.
export default defineBugCase({
  id: "formula/y2401-working-days-count-both-ends",
  title: "Working days between two dates count both ends",
  runner: "workday-diff-matrix",
  timeoutMs: 180_000,
  bug: {
    issue: "T7779",
    status: "fixed",
    sourceCommits: ["b930e4884"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-workday-diff",
    pairs: [
      ["2026-03-09", "2026-03-13"],
      ["2026-03-09", "2026-03-20"],
      ["2026-03-09", "2026-03-27"],
      ["2026-03-09", "2026-03-09"],
      ["2026-03-14", "2026-03-14"],
      ["2026-03-13", "2026-03-16"],
      ["2026-03-14", "2026-03-15"],
      ["2026-03-09", "2026-03-16"],
      ["2026-03-13", "2026-03-09"],
    ],
    timeZone: "Asia/Singapore",
  },
});
