import { defineBugCase } from "../../framework/types";

// T7979: Hiding a gallery's primary column through the column-meta API was
// accepted and stored, and a gallery without its primary column renders no
// cards - the whole view goes blank.
export default defineBugCase({
  id: "view/y3337-a-gallery-keeps-its-primary-column",
  title: "A gallery keeps its primary column visible when asked to hide it",
  runner: "gallery-primary-visible",
  timeoutMs: 180_000,
  bug: {
    issue: "T7979",
    status: "fixed",
    sourceCommits: ["8fc9df7cd"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-gallery-primary",
  },
});
