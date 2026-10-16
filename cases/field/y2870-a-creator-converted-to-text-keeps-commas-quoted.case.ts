import { defineBugCase } from "../../framework/types";

// T7789: Converting a created-by column to text left the cells empty, and a
// creator whose name contains a comma came through unquoted, reading as two
// people.
export default defineBugCase({
  id: "field/y2870-a-creator-converted-to-text-keeps-commas-quoted",
  title: "A creator column converted to text keeps each name as one name",
  runner: "created-by-to-text",
  timeoutMs: 180_000,
  bug: {
    issue: "T7789",
    status: "fixed",
    sourceCommits: ["2e8278870"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-creator-to-text",
    secondCreatorName: "Li, Lei",
  },
});
