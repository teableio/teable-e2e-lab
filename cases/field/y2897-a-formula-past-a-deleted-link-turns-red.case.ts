import { defineBugCase } from "../../framework/types";

// T7742: Deleting a link marked the lookup and the rollup reading it as broken,
// but not the formula one step further down, which went on presenting as a
// healthy column with nothing in it.
export default defineBugCase({
  id: "field/y2897-a-formula-past-a-deleted-link-turns-red",
  title: "Every column built on a deleted link is marked broken",
  runner: "deleted-link-error-chain",
  timeoutMs: 180_000,
  bug: {
    issue: "T7742",
    status: "fixed",
    sourceCommits: ["48918669e"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-deleted-link-chain",
    products: [
      {
        name: "apple",
        price: 10,
      },
      {
        name: "banana",
        price: 20,
      },
      {
        name: "orange",
        price: 30,
      },
    ],
    linkedProducts: ["apple", "banana"],
    orderTitle: "order-1",
  },
});
