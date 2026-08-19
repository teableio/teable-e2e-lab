import { defineBugCase } from "../../framework/types";

// A collapsed date group is hidden by excluding its rows from the row query,
// and that exclusion is derived from the group key. The derivation re-reads the
// key - an absolute instant - as if it were wall-clock time, so it drifts by
// the difference between the field's display zone and the server process zone.
// East of the server, the drift crosses a day boundary and the exclusion aims
// at the neighbouring day: the collapsed group's rows stay visible (and get
// drawn under the next group's header) while the neighbouring day's rows
// vanish.
//
// The lab runs its server process at UTC, which is also what the official image
// ships, so Asia/Shanghai here is not an exotic choice - it is the ordinary
// configuration of every deployment east of UTC.
export default defineBugCase({
  id: "record/collapsed-date-group-stays-hidden",
  title: "折叠日期分组后，该组的行不再出现在行列表里",
  runner: "group-collapse",
  timeoutMs: 120_000,
  bug: {
    issue: "T6856",
    status: "open",
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-collapsed-date-group",
    timeZone: "Asia/Shanghai",
    // Two consecutive local days, so collapsing the later one puts the
    // mis-aimed exclusion squarely on the earlier one's rows. Two rows each:
    // one row cannot tell "this group leaked" from "one stray row".
    buckets: [
      {
        localDay: "2025-11-30",
        instant: "2025-11-29T16:00:00.000Z",
        rowCount: 2,
      },
      {
        localDay: "2025-12-01",
        instant: "2025-11-30T16:00:00.000Z",
        rowCount: 2,
      },
    ],
  },
});
