import { defineBugCase } from "../../framework/types";

// T7025: giving somebody an authority-matrix role also puts them in the base,
// and puts them in as a Viewer. A Viewer, by their base role alone, may not
// archive anything; the role says they may. Two gates read those two answers and
// the wrong one went first, so the answer was always the Viewer's. The person was
// refused an action their role had been given, and the refusal named neither the
// role that grants it nor the base role that withholds it - while the settings
// screen showed everything correctly configured, because it was.
export default defineBugCase({
  id: "record/archive-a-row-your-role-says-you-may",
  title: "A role that grants archiving lets them archive",
  runner: "archive-granted-by-the-matrix",
  timeoutMs: 300_000,
  skipV1:
    "the case builds its own base for the authority matrix, and only the case base is unstamped - a base created inside a runner is born on v2, so v1 cannot be asked this",
  bug: {
    issue: "T7025",
    status: "fixed",
    sourceCommits: ["68b7d74f0"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-matrix-archive",
    allowedTeam: "theirs",
    rows: [
      { name: "row-they-may-reach", team: "theirs" },
      { name: "row-they-may-not-reach", team: "somebody-elses" },
    ],
  },
});
