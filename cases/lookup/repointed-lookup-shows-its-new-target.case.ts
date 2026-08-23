import { defineBugCase } from "../../framework/types";

// T6195: pointing a lookup somewhere else is an ordinary edit - the column it
// was following turned out to be the wrong one. A date column and a text
// column are stored differently underneath, and the lookup's own storage was
// left as it was, so what came back afterwards was not the text it now points
// at.
export default defineBugCase({
  id: "lookup/repointed-lookup-shows-its-new-target",
  title: "A lookup repointed from a date to a text column shows the text",
  runner: "lookup-retarget",
  timeoutMs: 300_000,
  bug: {
    issue: "T6195",
    status: "fixed",
    sourceCommits: ["d1c900011"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-lookup-retarget",
    dateValue: "2026-03-14T00:00:00.000Z",
    textValue: "the note it should show",
    settleTimeoutMs: 90_000,
    pollIntervalMs: 1_000,
  },
});
