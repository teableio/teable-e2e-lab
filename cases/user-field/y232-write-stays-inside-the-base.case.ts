import { defineBugCase } from "../../framework/types";

// T6640: a member column matched every email typed into it against every
// account on the platform - deleted accounts included - instead of against the
// people who work on this base. Anyone with an account anywhere could be
// written into a base they have nothing to do with, and would then be
// displayed to everyone in it and offered in the column's filter options as
// though they belonged.
export default defineBugCase({
  id: "user-field/y232-write-stays-inside-the-base",
  title: "A member column does not take someone from outside the base",
  runner: "user-write-scope",
  timeoutMs: 180_000,
  bug: {
    issue: "T6640",
    status: "fixed",
    sourceCommits: ["a896f4283"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-user-scope",
    outsiderName: "Outside This Base",
    insiderRowTitle: "someone-who-belongs-here",
    outsiderRowTitle: "someone-from-outside",
  },
});
