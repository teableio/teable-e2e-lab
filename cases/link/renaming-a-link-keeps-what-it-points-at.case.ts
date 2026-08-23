import { defineBugCase } from "../../framework/types";

// T5389: a link field's configuration is what makes it a link - which table it
// reaches, whether it holds one row or several, and the column it put on the
// other side. A rename says nothing about any of that, and a request changing
// only the name should leave all of it alone. What was left instead is a
// column that looks like a link and has lost the thing that connects it.
export default defineBugCase({
  id: "link/renaming-a-link-keeps-what-it-points-at",
  title: "Renaming a link field keeps the table it points at",
  runner: "link-rename-keeps-config",
  timeoutMs: 180_000,
  bug: {
    issue: "T5389",
    status: "fixed",
    sourceCommits: ["273ee81a2"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-rename",
    request: "patchName",
    renamedTo: "Responsible Person",
  },
});
