import { defineBugCase } from "../../framework/types";

// T6926: a space can be bound to a customer's own database, and that binding can
// be switched off - revoked credentials, a retired connection, a migration part
// way. The share link, the view and the permission are all still correct; there
// is simply nowhere to read from. What came back was an unhandled 500. To
// whoever holds the link - usually somebody outside the company, with no account
// and nobody to ask - a 500 says the product is broken and there is nothing to
// do; a 503 naming an unavailable database says the same page will work later.
export default defineBugCase({
  id: "base-share/a-share-link-whose-database-is-away",
  title: "A share link whose database is away says so",
  runner: "share-view-unready-data-db",
  timeoutMs: 180_000,
  skipV1:
    "the case makes its own space and base, and only the case base is unstamped - a base created inside a runner is born on v2, so the v1 column answers 'requested of v1 but v2 answered (reason=new_base)' rather than answering the question",
  bug: {
    issue: "T6926",
    status: "fixed",
    sourceCommits: ["bdcca3f24"],
  },
  config: {
    namePrefix: "e2e-lab-share-unready-db",
    rowTitle: "a-row-behind-the-link",
    encryptedUrlPlaceholder: "not-a-real-connection-string",
  },
});
