import { defineBugCase } from "../../framework/types";

// T8238: Converting text to a user field looked values up among every account
// on the instance, so an address of someone outside the base turned into that
// person's name and avatar.
export default defineBugCase({
  id: "user-field/y3641-converting-text-to-users-matches-only-collaborators",
  title: "Converting text to users matches only people in the base",
  runner: "user-conversion-collaborators-only",
  timeoutMs: 180_000,
  bug: {
    issue: "T8238",
    status: "fixed",
    sourceCommits: ["69e9cae86"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-user-conversion-scope",
  },
});
