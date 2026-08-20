import { defineBugCase } from "../../framework/types";

// Y132 / T6691: an authority-matrix guard treated a base owner as unrestricted
// and returned before narrowing that authority by the request's PAT. A token
// scoped to space A could therefore read or write resources in space B.
export default defineBugCase({
  id: "authority/y132-access-token-space-range",
  title:
    "An access token cannot escape its space range under an authority matrix",
  runner: "access-token-resource-isolation",
  timeoutMs: 180_000,
  bug: {
    issue: "T6691",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3003",
  },
  config: {
    spaceNamePrefix: "e2e-lab-y132-space",
    baseNamePrefix: "e2e-lab-y132-base",
    tableNamePrefix: "e2e-lab-y132-table",
    blockedRecordValue: "must-not-land",
  },
});
