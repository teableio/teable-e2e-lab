import { defineBugCase } from "../../framework/types";

// T6950: filling a link in by typing the other row's name is what every import
// does, and what a person does when they paste a column of names. The product
// found the row and stored it inside a list - on a column that holds one row.
// From then on one row in the table is shaped unlike all the others, with
// nothing on screen showing it.
export default defineBugCase({
  id: "link/fill-a-one-row-link-in-by-name",
  title: "Filling a one-row link in by name holds one row",
  runner: "manyone-typecast-shape",
  timeoutMs: 180_000,
  bug: {
    issue: "T6950",
    status: "fixed",
    sourceCommits: ["b11e6db68"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-link-by-name",
    targetName: "the-target-row",
    pickedRowName: "filled-by-picking",
    typedRowName: "filled-by-name",
  },
});
