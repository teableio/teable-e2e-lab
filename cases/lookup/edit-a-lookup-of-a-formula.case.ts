import { defineBugCase } from "../../framework/types";

// T6332: a column that looks up a computed value across a link carried a copy
// of the foreign formula's expression, and that copy made the column fail its
// own validation whenever anything touched it. The column worked - it showed
// the right number - and could not be renamed, re-pointed or converted. A
// column nobody can edit is a small thing until the base needs reorganising,
// and then it has to be deleted and rebuilt, taking whatever depends on it.
// Renaming alone is accepted on both columns; the case re-points the lookup.
export default defineBugCase({
  id: "lookup/edit-a-lookup-of-a-formula",
  title: "A lookup of a formula can still be edited",
  runner: "lookup-of-formula-edit",
  timeoutMs: 180_000,
  bug: {
    issue: "T6332",
    status: "fixed",
    sourceCommits: ["98790484e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-lookup-formula",
    hostRowTitle: "host-row",
    foreignRowTitle: "foreign-row",
    amount: 21,
    newName: "Doubled, renamed",
  },
});
