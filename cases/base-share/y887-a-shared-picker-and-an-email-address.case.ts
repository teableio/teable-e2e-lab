import { defineBugCase } from "../../framework/types";

// T5101: a shared form is a link anybody can open, and the picker on a people
// column is there so whoever fills it in can choose the person by name. It
// searched email addresses too, which turns the link into a way to check
// whether a given address belongs to this organisation - type it in, see if a
// person appears - and, address by address, a way to enumerate who works there.
// No account needed, and nothing about it looks like an attack: it is the
// form's own search box.
export default defineBugCase({
  id: "base-share/y887-a-shared-picker-and-an-email-address",
  title: "A shared form's picker does not answer to an email address",
  runner: "share-picker-email-oracle",
  timeoutMs: 180_000,
  bug: {
    issue: "T5101",
    status: "fixed",
    sourceCommits: ["0e3e350b6"],
  },
  config: {
    baseId: "seed-base",
    tableNamePrefix: "e2e-lab-share-picker-email",
  },
});
