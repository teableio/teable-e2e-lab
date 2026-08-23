import { defineBugCase } from "../../framework/types";

// T6510, the mirror image: a bare object written into a multi-value link.
// Same tolerance, same clients, and it was rejected by the same strict path.
export default defineBugCase({
  id: "link/multi-link-accepts-a-bare-object",
  title: "A multi-value link accepts the bare object v1 accepted",
  runner: "link-cell-shape",
  timeoutMs: 180_000,
  bug: {
    issue: "T6510",
    status: "fixed",
    sourceCommits: ["3c0513b1a"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-object-multi",
    shape: "objectIntoMulti",
  },
});
