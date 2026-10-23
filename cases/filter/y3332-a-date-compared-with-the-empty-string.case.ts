import { defineBugCase } from "../../framework/types";

// T7949: A TQL filter comparing a date column with the empty string went to the
// database as a timestamp compared with text, and the whole list request
// failed.
export default defineBugCase({
  id: "filter/y3332-a-date-compared-with-the-empty-string",
  title:
    "A TQL filter comparing a date with the empty string filters instead of failing",
  runner: "tql-empty-date",
  timeoutMs: 180_000,
  bug: {
    issue: "T7949",
    status: "fixed",
    sourceCommits: ["fc8ee4481"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-tql-empty-date",
    datedRow: "with-date",
    undatedRow: "without-date",
    date: "2026-09-30T12:00:00.000Z",
  },
});
