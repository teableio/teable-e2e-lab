import { defineBugCase } from "../../framework/types";

// T8057: Uploading an attachment from a link the remote server refuses answered
// 500 instead of a client error.
export default defineBugCase({
  id: "attachment/y3370-a-refused-attachment-link-is-a-client-error",
  title: "An attachment link the remote server refuses is a client error",
  runner: "url-attachment-refused-upstream",
  timeoutMs: 180_000,
  bug: {
    issue: "T8057",
    status: "fixed",
    sourceCommits: ["65a568d55"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-url-attachment-refused",
  },
});
