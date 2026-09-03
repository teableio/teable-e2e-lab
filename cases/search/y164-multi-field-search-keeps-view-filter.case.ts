import { defineBugCase } from "../../framework/types";

// Y164 / T6916: a multi-field search that included a date could escape the
// saved view filter and return same-day rows from a category the view hid.
export default defineBugCase({
  id: "search/y164-multi-field-search-keeps-view-filter",
  title: "A multi-field date search stays inside every saved view filter",
  runner: "mixed-field-search-view-filter",
  timeoutMs: 120_000,
  bug: {
    issue: "T6916",
    status: "fixed",
    sourceCommits: ["e686cd95d"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-y164-search-view-filter",
    timeZone: "UTC",
    searchTerm: "2022-03-02",
    targetDate: "2022-03-02T12:00:00.000Z",
    otherDate: "2022-03-01T12:00:00.000Z",
    keptCategory: "Keep",
    droppedCategory: "Drop",
    expectedRowTitle: "target-date-kept-category",
    sameDateOutsideViewTitle: "target-date-dropped-category",
    otherDateRowTitle: "other-date-kept-category",
  },
});
