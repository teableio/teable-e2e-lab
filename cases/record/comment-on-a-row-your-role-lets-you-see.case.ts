import { defineBugCase } from "../../framework/types";

// T7034: giving somebody an authority-matrix role also puts them in the base, as
// a Viewer, and a Viewer by their base role alone may not comment. The role says
// they may. Commenting was gated on the base role alone, so the grant never
// reached the write: the person can see the record, open it and read the thread,
// and cannot add to it, told only that the resource is restricted. The same
// change also had to bound commenting by the role's row conditions, which the
// base-role path never applied.
export default defineBugCase({
  id: "record/comment-on-a-row-your-role-lets-you-see",
  title: "A role that lets them comment lets them comment",
  runner: "comment-granted-by-the-matrix",
  timeoutMs: 300_000,
  skipV1:
    "the case builds its own base for the authority matrix, and only the case base is unstamped - a base created inside a runner is born on v2, so v1 cannot be asked this",
  bug: {
    issue: "T7034",
    status: "fixed",
    sourceCommits: ["38d0e067e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-matrix-comment",
    allowedTeam: "theirs",
    rows: [
      { name: "row-they-may-reach", team: "theirs" },
      { name: "row-they-may-not-reach", team: "somebody-elses" },
    ],
    commentText: "a-comment-their-role-permits",
  },
});
