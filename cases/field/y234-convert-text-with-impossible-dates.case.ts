import { defineBugCase } from "../../framework/types";

// T6519: a text column being turned into a date column stopped on the first
// value that is not a real date. A column somebody typed into always has a
// few - a February 30th, a month 13, a typo, a word - so the conversion that
// tidies up after an import is the one most likely to be refused, and the
// message names a value rather than a row.
export default defineBugCase({
  id: "field/y234-convert-text-with-impossible-dates",
  title: "A text column with impossible dates still converts to a date column",
  runner: "text-to-date-conversion",
  timeoutMs: 180_000,
  bug: {
    issue: "T6519",
    status: "fixed",
    sourceCommits: ["abbb221bf"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-text-to-date",
    rows: [
      // Right shape, no such day.
      { name: "february-30", text: "2026-02-30", becomes: "empty" },
      // 2026 is not a leap year.
      { name: "not-a-leap-year", text: "2026-02-29", becomes: "empty" },
      { name: "month-13", text: "2026-13-01", becomes: "empty" },
      { name: "day-32", text: "2026-01-32", becomes: "empty" },
      {
        name: "not-a-date-at-all",
        text: "sometime in march",
        becomes: "empty",
      },
      // The one real date, which has to survive.
      { name: "a-real-date", text: "2026-03-01", becomes: "date" },
    ],
  },
});
