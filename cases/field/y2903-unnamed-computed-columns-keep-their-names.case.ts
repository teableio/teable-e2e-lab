import { defineBugCase } from "../../framework/types";

// T7744: A conditional rollup created through the API without a name was called
// "<field> conditional rollup" instead of "<field> Reference (<table>)".
export default defineBugCase({
  id: "field/y2903-unnamed-computed-columns-keep-their-names",
  title:
    "Computed columns created without a name get their usual default names",
  runner: "computed-default-names",
  timeoutMs: 180_000,
  bug: {
    issue: "T7744",
    status: "fixed",
    sourceCommits: ["12227acb9"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-default-names",
    formulaName: "Calculation",
  },
});
