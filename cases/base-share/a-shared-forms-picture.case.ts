import { defineBugCase } from "../../framework/types";

// T6604: where a form's picture lives is stored as a short path, and the address
// a browser can fetch is worked out from it when the form is read. A shared form
// is read through two layers, and both worked it out - the second over the
// first's answer - so what came back was one address with another stuck on the
// front of it, which fetches nothing. The person who opens the link sees a form
// with a broken picture while the same form inside the product looks right,
// because inside it is read through one layer only.
export default defineBugCase({
  id: "base-share/a-shared-forms-picture",
  title: "A shared form's picture has one address, not two",
  runner: "shared-form-cover-url",
  timeoutMs: 180_000,
  bug: {
    issue: "T6604",
    status: "fixed",
    sourceCommits: ["573e0b70e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-form-cover",
    rowTitle: "a-row-behind-the-form",
    storedPath: "form/e2e-lab-cover-image",
  },
});
