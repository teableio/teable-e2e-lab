import { defineBugCase } from "../../framework/types";

// T6925: "is this overdue" is the most-copied formula there is - something is
// late once the clock passes a deadline worked out from when the row appeared.
// It mixes a time comparison with a yes/no answer, and that mixture was
// compiled as though the timestamps were text, which the database refuses
// outright. The refusal happened while the column was being filled in, so the
// column never got values - and an empty overdue column reads as nothing being
// overdue, which is the answer people act on.
export default defineBugCase({
  id: "formula/an-is-this-overdue-column",
  title: "An is-this-overdue column has an answer",
  runner: "overdue-formula-backfill",
  timeoutMs: 240_000,
  bug: {
    issue: "T6925",
    status: "fixed",
    sourceCommits: ["7829d83c6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-overdue-formula",
    rowTitles: ["first-row", "second-row"],
    hours: 1,
    overdueAnswer: "overdue",
    fineAnswer: "not overdue",
    settleTimeoutMs: 60_000,
    pollIntervalMs: 1_000,
  },
});
