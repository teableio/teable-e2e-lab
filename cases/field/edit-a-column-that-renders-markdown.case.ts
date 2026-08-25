import { defineBugCase } from "../../framework/types";

// T6956: rendering as Markdown is why a column is a long-text column - it is
// where notes with headings, lists and links live, chosen once and then
// forgotten about. The field editor reads the column, shows what it reads, and
// sends all of it back on save; what it read did not mention Markdown, so what
// it sent back did not either. The notes are still there and are suddenly full
// of asterisks and hashes.
export default defineBugCase({
  id: "field/edit-a-column-that-renders-markdown",
  title: "Editing a Markdown column keeps it rendering",
  runner: "longtext-markdown-convert",
  timeoutMs: 180_000,
  bug: {
    issue: "T6956",
    status: "fixed",
    sourceCommits: ["ed1dc355a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-markdown-column",
    renamedTo: "Meeting notes",
  },
});
