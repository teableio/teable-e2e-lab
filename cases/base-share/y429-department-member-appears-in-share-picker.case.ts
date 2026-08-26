import { defineBugCase } from "../../framework/types";

export default defineBugCase({
  id: "base-share/y429-department-member-appears-in-share-picker",
  title: "Y429: A department member appears in a shared user picker",
  bug: {
    issue: "T6963",
    status: "fixed",
    link: "https://github.com/teableio/teable-ee/pull/3174",
    sourceCommits: ["fc8702204"],
  },
  runner: "department-share-user-picker",
  config: {
    spaceNamePrefix: "e2e-department-share-space",
    baseNamePrefix: "e2e-department-share-base",
    tableNamePrefix: "e2e-department-share-table",
    departmentNamePrefix: "e2e-share-department",
    memberNamePrefix: "e2e-share-member",
  },
  timeoutMs: 180_000,
});
