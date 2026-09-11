import { defineBugCase } from "../../framework/types";

// T7159: a worked-out column shows how far along it is by the page subscribing
// to its progress, and whether somebody may watch that is a separate permission
// from reading the column - a person who sees a filtered slice of the rows must
// not be told about work across all of them. The description the column arrived
// with did not carry that permission at all, so the page subscribed anyway; the
// server refused, and the refusal failed the whole batch the page had asked for
// and put "this resource is restricted" on screen, in a table the person is
// allowed to read.
export default defineBugCase({
  id: "authority/y882-a-column-that-says-whether-progress-may-be-watched",
  title: "A worked-out column says whether its progress may be watched",
  runner: "authority-computed-activity-capability",
  timeoutMs: 240_000,
  bug: {
    issue: "T7159",
    status: "fixed",
    sourceCommits: ["30f50eed0"],
  },
  config: {
    tableNamePrefix: "e2e-lab-computed-activity-capability",
    rows: [{ scope: "visible" }, { scope: "hidden" }],
    visibleScope: "visible",
  },
});
