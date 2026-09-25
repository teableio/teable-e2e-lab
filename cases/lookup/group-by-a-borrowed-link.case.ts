import { defineBugCase } from "../../framework/types";

// T7536, the second symptom: grouped ascending by a link borrowed through
// another link, "kids" came before "0kids HQ" - the headings were not ordered
// by the titles they show. Grouping by the source's own link was right.
export default defineBugCase({
  id: "lookup/group-by-a-borrowed-link",
  title: "Groups on a borrowed link follow the titles they show",
  runner: "lookup-link-group-order",
  timeoutMs: 180_000,
  bug: {
    issue: "T7536",
    status: "fixed",
    sourceCommits: ["5970fbe7f"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-borrowed-link-group",
    titles: ["0Alpha", "Beta"],
  },
});
