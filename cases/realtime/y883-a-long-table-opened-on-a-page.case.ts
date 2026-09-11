import { defineBugCase } from "../../framework/types";

// T6479: a page does not fetch its rows one by one - it subscribes, is told
// which rows are in the answer, and asks for all of them in a single request
// carrying every id. That request was assembled as a query string, and past a
// certain number of rows it stopped fitting: the server refused it for
// oversized headers before it reached any handler, and the page sat there with
// a subscription and no rows. Under the limit everything works; over it the
// table is empty for everybody.
export default defineBugCase({
  id: "realtime/y883-a-long-table-opened-on-a-page",
  title: "A page opened on a long table is given its rows",
  runner: "wide-window-socket-load",
  timeoutMs: 300_000,
  bug: {
    issue: "T6479",
    status: "fixed",
    sourceCommits: ["7de765bf8"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-wide-window",
    recordCount: 800,
    writeBatchSize: 100,
    headerLimitBytes: 16_384,
    subscribeTimeoutMs: 60_000,
  },
});
