import { defineBugCase } from "../../framework/types";

// T3816: being told is the whole point of a member column. Someone puts your
// name in a row and you find out - that is how work is handed over in a base,
// and what people rely on instead of sending a message. Nothing was sent: the
// row says the work is yours and you have no idea, so the handover happens in
// a chat message anyway or not at all, while the column looks like it is
// working because the name is right there in the cell.
//
// The other notification cases in this repository assert the opposite for
// particular paths - an import, a table duplicate or an undo must not notify
// anyone - and all of them take an ordinary assignment's notification for
// granted as their control. This case holds that half down on its own.
export default defineBugCase({
  id: "user-field/assigning-someone-tells-them",
  title: "Assigning someone in a member column tells them",
  runner: "user-field-notify-on-assign",
  timeoutMs: 240_000,
  bug: {
    issue: "T3816",
    status: "fixed",
    sourceCommits: ["ed946fb42"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-notify-assign",
    rowTitle: "work-handed-over",
    notifyTimeoutMs: 60_000,
    pollIntervalMs: 1_000,
  },
});
