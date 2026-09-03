import { defineBugCase } from "../../framework/types";

// T6790: duplicating a table carried each view's sharing across with it - the
// switch, the rules, and the password - and only minted a new address. The copy
// was therefore a live public page from the moment it existed, reachable by
// anyone who had ever been given the source's password, with nothing in the
// interface saying so and no prompt asking. Duplicating a base already got this
// right; duplicating a table did not, and the difference had been frozen into a
// test.
export default defineBugCase({
  id: "table/a-duplicated-table-starts-unshared",
  title: "A duplicated table does not come out already published",
  runner: "duplicate-shared-view",
  timeoutMs: 180_000,
  bug: {
    issue: "T6790",
    status: "fixed",
    sourceCommits: ["a5f02fd0c"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-duplicate-unshared",
    rowTitle: "row-1",
    assert: "copyIsNotShared",
    shareMeta: {
      password: "not-for-the-copy",
      allowCopy: true,
      includeHiddenField: true,
    },
  },
});
