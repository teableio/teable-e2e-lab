import { defineBugCase } from "../../framework/types";

// T4138: turning free text into a set of choices is how a column gets tidied
// up once people have been typing into it - every distinct value becomes an
// option. One row where somebody pasted a paragraph turned that paragraph into
// an option, and from then on the dropdown, every filter and every colour rule
// built on the column carried a page of prose as one of its entries.
export default defineBugCase({
  id: "field/y325-a-value-too-long-to-be-a-choice",
  title: "A value too long to be a choice is refused, and nothing changes",
  runner: "oversized-select-choice",
  timeoutMs: 180_000,
  bug: {
    issue: "T4138",
    status: "fixed",
    sourceCommits: ["e1318abdb"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-long-choice",
    // The product's limit on the length of a choice name.
    limit: 1_000,
    oversizedLength: 1_200,
    shortValues: ["Renewal", "New business"],
  },
});
