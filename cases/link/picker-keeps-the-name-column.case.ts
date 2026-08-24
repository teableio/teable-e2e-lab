import { defineBugCase } from "../../framework/types";

// T6335: a link column can be told which columns of the table it points at to
// show while choosing a record. Whoever configures it ticks the extra columns
// and does not tick the name - the name is what a row is called, not an extra.
// Leaving it unticked took it out of the list, so every row in the picker was
// identified by the extra column alone and there was no way to tell which one
// to choose. The link itself keeps working; only choosing does not.
export default defineBugCase({
  id: "link/picker-keeps-the-name-column",
  title: "The record picker still says what each row is called",
  runner: "link-picker-primary-field",
  timeoutMs: 180_000,
  bug: {
    issue: "T6335",
    status: "fixed",
    sourceCommits: ["4bc22c79a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-picker",
    hostRowTitle: "host-row",
    linkFieldName: "Order",
    shownFieldName: "Amount",
    hiddenFieldName: "Internal note",
    // Two rows share an amount, so a picker showing only the amount cannot be
    // used even in principle.
    rows: [
      { name: "Order A", shown: "42", hidden: "not for sharing" },
      { name: "Order B", shown: "17", hidden: "not for sharing" },
      { name: "Order C", shown: "42", hidden: "not for sharing" },
    ],
  },
});
