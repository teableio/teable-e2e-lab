import { defineBugCase } from "../../framework/types";

// T6541: whether somebody may publish part of a base is one of the things a
// role decides, and the two ways of publishing - a link to one view, a link to
// the whole base - are the same decision about different amounts of data. Only
// the view link was checked. The restricted person clicked share on a view and
// was refused, clicked share on the table and got a link: the more dangerous of
// the two was the one that worked.
export default defineBugCase({
  id: "authority/y900-sharing-a-view-and-sharing-the-base",
  title: "A role that withholds sharing withholds both kinds",
  runner: "restricted-cannot-share-a-base",
  timeoutMs: 240_000,
  bug: {
    issue: "T6541",
    status: "fixed",
    sourceCommits: ["fbfcd6e33"],
  },
  config: {
    namePrefix: "e2e-lab-share-permission",
    rowName: "a row",
    join: "creator",
    expectedStatus: 403,
  },
});
