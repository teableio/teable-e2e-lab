import { defineBugCase } from "../../framework/types";

// T2571: duplicating a base is what people do before trying something they are
// not sure about, and the copy is the thing they are about to work in. It was
// not in the list of bases recently opened at all - not listed late, absent.
// To someone who just pressed duplicate and is looking at a list that does not
// mention it, the copy did not get made, and the next move is to press
// duplicate again.
export default defineBugCase({
  id: "base-share/a-duplicated-base-in-the-recent-list",
  title: "A freshly duplicated base is in the recent list",
  runner: "duplicate-base-recent-list",
  timeoutMs: 240_000,
  // Recent bases are user-global state. Another concurrent case may visit its
  // own base after this copy and correctly move ahead of it, invalidating this
  // checkpoint without reproducing T2571.
  serial: true,
  bug: {
    issue: "T2571",
    status: "fixed",
    sourceCommits: ["603084199"],
  },
  config: {
    baseNamePrefix: "e2e-lab-recent-base",
  },
});
