import { defineBugCase } from "../../framework/types";

// T7581: a person holding several roles, searching with non-matching rows
// hidden, got back rows without the keyword - every row one role could see.
// The merged row scope "A or B" was joined to the search without brackets.
export default defineBugCase({
  id: "authority/a-search-across-several-roles",
  title: "A search by someone with several roles returns only matching rows",
  runner: "multi-role-search-scope",
  timeoutMs: 240_000,
  bug: {
    issue: "T7581",
    status: "fixed",
    sourceCommits: ["b7a917a3f"],
  },
  config: {
    tableNamePrefix: "e2e-lab-multi-role-search",
    fieldCount: 30,
    keyword: "zkw",
    matchingRows: 4,
    roles: [
      { fieldIndex: 28, operator: "isNot", value: "deny" },
      { fieldIndex: 2, operator: "is", value: "b1" },
      { fieldIndex: 29, operator: "isNot", value: "deny" },
    ],
  },
});
