import { defineBugCase } from "../../framework/types";

// T6285: connecting an app shows a list of what it is asking for, and approving
// is meant to grant that list and nothing more - that list is the whole of what
// a person is agreeing to, and it is the only thing they see. One permission
// was added to every token regardless: the ability to list every base the
// approving person can reach. An app approved for reading one table could
// enumerate the whole account's bases, and nothing on the approval screen said
// so.
export default defineBugCase({
  id: "authority/y893-an-approved-app-and-everything-else",
  title: "An approved app can do only what it was approved for",
  runner: "oauth-scope-not-widened",
  timeoutMs: 180_000,
  bug: {
    issue: "T6285",
    status: "fixed",
    sourceCommits: ["22c343454"],
  },
  config: {
    appName: "e2e-lab-scope",
    homepage: "http://localhost:3000",
    redirectUri: "http://localhost:3000/callback",
    consentedScope: "table|read",
    // Any working token answers here; the case only needs to know the token
    // is usable at all.
    inScopePath: "/auth/user",
    outOfScopePath: "/base/access/all",
    expectedStatus: 403,
  },
});
