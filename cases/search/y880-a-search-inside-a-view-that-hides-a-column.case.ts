import { defineBugCase } from "../../framework/types";

// T7268: a grid does not ask the server to "use the view" - it reads the view's
// filter and sort, inlines them, and sets ignoreViewQuery. That flag was read as
// "no view at all", so which columns the view hides stopped applying to the
// search and it fell back to every column in the table. Rows matching only in a
// hidden column came back as results with nothing on screen to explain them.
export default defineBugCase({
  id: "search/y880-a-search-inside-a-view-that-hides-a-column",
  title: "A search inside a view stays inside the columns it shows",
  runner: "search-hidden-field-inlined-view",
  timeoutMs: 180_000,
  bug: {
    issue: "T7268",
    status: "fixed",
    sourceCommits: ["5a04f1e81"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-search-hidden-view-field",
    rows: [
      { title: "alpha row", note: "plain note" },
      { title: "beta row", note: "hidden probe value" },
    ],
    hiddenTerm: "hidden probe",
    visibleTerm: "alpha",
  },
});
