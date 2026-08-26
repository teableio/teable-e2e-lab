import { defineBugCase } from "../../framework/types";

// T3510: time zones have more than one name each - "Asia/Calcutta" and
// "Asia/Kolkata" are the same zone. Which one arrives is not the user's
// choice: it is whatever their browser, their spreadsheet or the system
// exporting to them sends, and the older names are still widely sent. The
// accepted list held only the current names, so those requests were refused
// and the person could not create a date column at all, with a message about
// a zone they never picked by hand.
export default defineBugCase({
  id: "field/y326-a-date-column-in-an-aliased-timezone",
  title: "A date column can be created in a zone under its older name",
  runner: "timezone-alias",
  timeoutMs: 180_000,
  bug: {
    issue: "T3510",
    status: "fixed",
    sourceCommits: ["596b713d7"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-tz-alias",
    // India, under the name most older systems still send.
    aliasZone: "Asia/Calcutta",
    value: "2026-03-01T00:00:00.000Z",
  },
});
