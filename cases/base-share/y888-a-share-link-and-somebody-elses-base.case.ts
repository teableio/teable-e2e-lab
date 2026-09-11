import { defineBugCase } from "../../framework/types";

// T6185: sharing a whole base hands out a link, which the browser sends as a
// header with every request while that base is open. Which base the request is
// for is a separate part of the request, and for whole-base shares the two were
// never compared - so anybody holding any such link could put somebody else's
// base id in the request and be answered: read its structure, export it. No
// share on the victim base, no membership, nothing beyond one valid link of
// one's own.
export default defineBugCase({
  id: "base-share/y888-a-share-link-and-somebody-elses-base",
  title: "A share link only opens the base it was made for",
  runner: "whole-base-share-replay",
  timeoutMs: 180_000,
  bug: {
    issue: "T6185",
    status: "fixed",
    sourceCommits: ["f14f2ef5e"],
  },
  config: {
    namePrefix: "e2e-lab-whole-base-share",
    password: "12345678a",
    victimTableName: "Payroll",
    victimRowTitle: "a row nobody shared",
    expectedStatus: 403,
  },
});
