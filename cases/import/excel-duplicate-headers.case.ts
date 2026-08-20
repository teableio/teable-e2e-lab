import { defineBugCase } from "../../framework/types";

// T6855: POST /api/import/:baseId was already marked for v2, but the
// controller only let CSV through - Excel was pushed back with
// v2Reason=unsupported_feature and ran v1's createTableFromImport, which added
// the new table's columns in one batch without making their physical names
// unique. A header row repeating a name therefore answered Postgres 42701,
// `column already exists`, and the import 500'd. Five events across two users
// (Sentry BACKEND-AI-1F5) before it was traced.
export default defineBugCase({
  id: "import/excel-duplicate-headers",
  title:
    "An Excel sheet with repeated column headers imports without colliding",
  runner: "excel-import-duplicate-columns",
  timeoutMs: 300_000,
  bug: {
    issue: "T6855",
    status: "fixed",
    sourceCommits: ["afcc4d00e"],
  },
  config: {
    tableNamePrefix: "e2e-lab-excel-dup",
    // "Amount" twice is the collision. "status"/"Status" is a control: quoted
    // identifiers are case-sensitive so those two do NOT conflict, and both
    // must survive unrenamed - deduplication should touch only what collides.
    headers: ["Name", "Amount", "Amount", "status", "Status"],
    row: ["row-1", "1", "2", "open", "closed"],
    timeZone: "Asia/Shanghai",
  },
});
