import { defineBugCase } from "../../framework/types";

// T6508: a link to a row whose primary cell is empty persists as
// {id, title: null} - there is no title to carry. Write validation then
// rejected the null title, so every later rewrite of that cell answered 400:
// reselecting the row, an import touching it, an automation writing it back.
// The value being refused is the one the product itself had stored.
export default defineBugCase({
  id: "link/link-to-a-row-without-a-name-rewrites",
  title: "A link to a row with an empty name can be written again",
  runner: "link-cell-shape",
  timeoutMs: 180_000,
  bug: {
    issue: "T6508",
    status: "fixed",
    sourceCommits: ["e23b02f48"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-null-title",
    shape: "nullTitle",
  },
});
