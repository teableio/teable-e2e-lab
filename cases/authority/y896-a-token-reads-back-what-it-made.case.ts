import { defineBugCase } from "../../framework/types";

// T7115: a personal token is how anything outside the browser works with this
// product - scripts, the command line, another service. These pages could be
// created with a token and then not read with it: fetching the page, listing
// pages and asking for its versions were all refused outright, because those
// routes declared no permission and never opted into token access. The account
// owns the page; the token that made it could not see it.
export default defineBugCase({
  id: "authority/y896-a-token-reads-back-what-it-made",
  title: "A token can read back the page it made",
  runner: "token-reaches-its-own-artifact",
  timeoutMs: 180_000,
  bug: {
    issue: "T7115",
    status: "fixed",
    sourceCommits: ["fd031a8fb"],
  },
  config: {
    tokenNamePrefix: "e2e-lab-artifact-token",
    scopes: ["base|read", "base|update"],
    tokenLifetimeMs: 7 * 24 * 60 * 60 * 1000,
    artifactName: "e2e-lab-page",
    artifactContent: "<!doctype html><title>e2e-lab</title><p>made by a token",
  },
});
