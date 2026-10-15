import { defineBugCase } from "../../framework/types";

// T7785: Converting a created-time column to plain text or to an ordinary date
// answered 200 and left the column empty: every row's creation date was gone,
// with nothing to undo because nothing had failed.
export default defineBugCase({
  id: "field/y2854-a-converted-created-time-keeps-its-dates",
  title: "A created time converted to text or a date keeps every row's moment",
  runner: "created-time-conversion",
  timeoutMs: 180_000,
  bug: {
    issue: "T7785",
    status: "fixed",
    sourceCommits: ["2e8278870"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-created-convert",
    rowTitle: "entry",
    targets: ["singleLineText", "date"],
    timeZone: "Asia/Tokyo",
    writtenDate: "2020-01-01T00:00:00.000Z",
  },
});
