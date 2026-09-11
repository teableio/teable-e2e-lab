import { defineBugCase } from "../../framework/types";

// T6548: a link column is a permission of its own - whoever may work in this
// table and use this column may pick from the records it points at, which is
// what makes link columns usable without handing out the table behind them.
// The picker started applying the target table's own row scope as well, so
// somebody whose role narrows that table got an empty picker: 200, no records,
// nothing on screen saying why - while the same record's title is still shown
// in cells that already link to it.
export default defineBugCase({
  id: "authority/y898-a-link-picker-that-offers-nothing",
  title: "A link picker offers what the column points at",
  runner: "link-picker-foreign-scope",
  timeoutMs: 240_000,
  bug: {
    issue: "T6548",
    status: "fixed",
    sourceCommits: ["354a478f0"],
  },
  config: {
    namePrefix: "e2e-lab-link-picker-scope",
    sourceRowName: "Order 1",
    inScopeName: "Northwind",
    outOfScopeName: "Contoso",
    visibleScope: "mine",
    hiddenScope: "theirs",
  },
});
