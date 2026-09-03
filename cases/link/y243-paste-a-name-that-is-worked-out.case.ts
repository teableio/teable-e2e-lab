import { defineBugCase } from "../../framework/types";

// T5316: plenty of tables name their rows by rule - an invoice number built
// from a prefix and a counter, a full name assembled from two columns. That
// first column is what a link displays and what pasting into a link matches
// against, and matching was only allowed when the column was plain typed text.
// So pasting a list of invoice numbers into a link column - the most ordinary
// way to fill one in - failed on exactly the tables whose names are most
// predictable.
export default defineBugCase({
  id: "link/y243-paste-a-name-that-is-worked-out",
  title: "Pasting a worked-out name into a link finds the row",
  runner: "link-paste-formula-title",
  timeoutMs: 180_000,
  bug: {
    issue: "T5316",
    status: "fixed",
    sourceCommits: ["cb58a12d6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-formula-title-link",
    hostRowTitle: "host-row",
    prefix: "INV-",
    foreignRows: ["1042", "1043", "1044"],
  },
});
