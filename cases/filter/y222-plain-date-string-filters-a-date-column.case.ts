import { defineBugCase } from "../../framework/types";

// T5584: a date filter has a shape - a mode, a date, a time zone - and v1 also
// took the date on its own. Integrations written against v1 send that: a saved
// view's filter migrated forward, a script that builds a query, a report that
// asks for everything dated the 12th. v2 did not recognise the bare string, so
// the filter matched nothing - the worst way for a filter to fail, because an
// empty result reads as "there is nothing there" and the report built on it is
// quietly wrong rather than visibly broken.
export default defineBugCase({
  id: "filter/y222-plain-date-string-filters-a-date-column",
  title: "Filtering a date column by a plain date string finds its rows",
  runner: "legacy-date-filter",
  timeoutMs: 180_000,
  bug: {
    issue: "T5584",
    status: "fixed",
    sourceCommits: ["607df981f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-legacy-date-filter",
    timeZone: "UTC",
    rows: [
      { name: "on-the-day", date: "2026-02-12T09:00:00.000Z" },
      { name: "also-on-the-day", date: "2026-02-12T18:30:00.000Z" },
      { name: "the-day-after", date: "2026-02-13T09:00:00.000Z" },
    ],
    filterDate: "2026-02-12T09:00:00.000Z",
  },
});
