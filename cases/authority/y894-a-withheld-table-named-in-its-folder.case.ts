import { defineBugCase } from "../../framework/types";

// T7027: withholding a table is meant to make it not exist as far as that
// person is concerned, and the list they are given leaves it out - the part
// everybody checks. What was not left out was the folder's own record of what
// is inside it: the table was gone from the list and still named in its
// parent's contents, so the answer described a thing the same answer refused to
// describe, and anything reading it had an id to ask about for a table nobody
// meant them to know exists.
export default defineBugCase({
  id: "authority/y894-a-withheld-table-named-in-its-folder",
  title: "A withheld table is not named anywhere in what a person is given",
  runner: "hidden-node-still-referenced",
  timeoutMs: 240_000,
  bug: {
    issue: "T7027",
    status: "fixed",
    sourceCommits: ["6235527b4"],
  },
  config: {
    namePrefix: "e2e-lab-hidden-node",
    hiddenTableName: "payroll",
    visibleTableName: "roster",
  },
});
