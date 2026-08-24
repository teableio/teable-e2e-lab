import { defineBugCase } from "../../framework/types";

// T4884: some columns are filled in by the product, not by the person - who
// created the row, when, anything worked out from other columns. A form can
// end up with one of those marked required: the column was ordinary when the
// form was built and became automatic later, or the marking came over from an
// older version of the form. Every submission was then refused for a column
// the person filling the form cannot see and could not fill in - and a form is
// the one part of a base used by people who cannot fix it.
export default defineBugCase({
  id: "view/a-form-with-a-required-automatic-column",
  title: "A form submits when an automatic column is marked required",
  runner: "form-required-computed",
  timeoutMs: 180_000,
  bug: {
    issue: "T4884",
    status: "fixed",
    sourceCommits: ["b71617ed0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-form-required",
    submittedName: "submitted-by-the-form",
  },
});
