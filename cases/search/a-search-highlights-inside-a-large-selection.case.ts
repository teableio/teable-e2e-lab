import { defineBugCase } from "../../framework/types";

// T8327: The highlight request put every selected record id into the query
// string, so a selection of around a thousand rows made the request too large
// to be accepted (431 from the server, 414 behind a proxy) and nothing was
// highlighted.
export default defineBugCase({
  id: "search/a-search-highlights-inside-a-large-selection",
  title: "A search highlights its matches inside a large selection",
  runner: "search-matches-scope",
  timeoutMs: 180_000,
  bug: {
    issue: "T8327",
    status: "fixed",
    sourceCommits: ["5f7bc39d9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-search-large-scope",
    scenario: "large-highlight-scope",
    rowCount: 1000,
    needleRows: 3,
    needle: "needle-scope",
    take: 1000,
    selectedRecordCount: 1000,
  },
});
