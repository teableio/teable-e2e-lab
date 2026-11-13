import { defineBugCase } from "../../framework/types";

// T8231: Duplicating the reverse side of a many-to-one link reused the
// original's storage or none: the copy came out empty, or editing it rewired
// the real relationship.
export default defineBugCase({
  id: "link/y3638-a-duplicated-reverse-link-keeps-its-children",
  title:
    "A duplicated reverse link column keeps its children and stays independent",
  runner: "duplicate-reverse-link-field",
  timeoutMs: 180_000,
  bug: {
    issue: "T8231",
    status: "fixed",
    sourceCommits: ["55feac994"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-duplicate-reverse-link",
  },
});
