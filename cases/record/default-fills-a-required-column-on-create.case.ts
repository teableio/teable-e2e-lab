import { defineBugCase } from "../../framework/types";

// T5686: "required" and "has a default" belong together - the default is the
// answer for everyone who does not supply one. A record created without that
// column was refused for being empty, before the default had been applied.
// The default was never going to leave it empty.
export default defineBugCase({
  id: "record/default-fills-a-required-column-on-create",
  title: "Creating a record fills a required column from its default",
  runner: "required-default",
  timeoutMs: 180_000,
  bug: {
    issue: "T5686",
    status: "fixed",
    sourceCommits: ["9bc67c4be"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-required-create",
    moment: "onCreate",
    defaultValue: "unassigned",
  },
});
